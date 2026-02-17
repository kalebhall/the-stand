import { inflateSync } from 'node:zlib';

function decodePdfString(value: string): string {
  return value
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\\/g, '\\');
}

function extractTextFromStream(stream: string): string {
  const segments: string[] = [];

  const tjMatches = stream.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g);
  for (const match of tjMatches) {
    const token = match[0].replace(/\s*Tj$/, '');
    segments.push(decodePdfString(token.slice(1, -1)));
  }

  const tjArrayMatches = stream.matchAll(/\[(.*?)\]\s*TJ/gs);
  for (const match of tjArrayMatches) {
    const arrayContent = match[1] ?? '';
    const strings = Array.from(arrayContent.matchAll(/\((?:\\.|[^\\)])*\)/g)).map((item) =>
      decodePdfString(item[0].slice(1, -1))
    );
    if (strings.length) {
      segments.push(strings.join(''));
    }
  }

  return segments.join('\n');
}

export async function extractPdfText(fileData: ArrayBuffer): Promise<string> {
  const pdfBuffer = Buffer.from(fileData);
  const source = pdfBuffer.toString('latin1');
  const output: string[] = [];

  const streamPattern = /<<(?:.|\n|\r)*?>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of source.matchAll(streamPattern)) {
    const dictionary = match[0];
    const rawStream = match[1] ?? '';
    let decoded = Buffer.from(rawStream, 'latin1');

    if (/\/Filter\s*\/FlateDecode/.test(dictionary)) {
      try {
        decoded = inflateSync(decoded);
      } catch {
        continue;
      }
    }

    const text = extractTextFromStream(decoded.toString('latin1'));
    if (text.trim()) {
      output.push(text);
    }
  }

  return output.join('\n');
}
