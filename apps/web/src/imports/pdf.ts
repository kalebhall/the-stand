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
  let currentY: number | null = null;
  const lineSegments: Map<number, string[]> = new Map();

  // Extract text positioning data (Tm matrix operations)
  const tmMatches = stream.matchAll(/([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+Tm/g);
  const positions: Array<{ x: number; y: number }> = [];
  for (const match of tmMatches) {
    const x = Number.parseFloat(match[5] ?? '0');
    const y = Number.parseFloat(match[6] ?? '0');
    positions.push({ x, y });
  }

  // Extract text with simple Tj operator
  const tjMatches = stream.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g);
  let posIndex = 0;
  for (const match of tjMatches) {
    const token = match[0].replace(/\s*Tj$/, '');
    const text = decodePdfString(token.slice(1, -1));
    
    if (positions[posIndex]) {
      const pos = positions[posIndex];
      const yKey = Math.round(pos.y * 10) / 10; // Round to 1 decimal for grouping
      
      if (!lineSegments.has(yKey)) {
        lineSegments.set(yKey, []);
      }
      lineSegments.get(yKey)?.push(text);
    } else {
      segments.push(text);
    }
    posIndex++;
  }

  // Extract text with TJ array operator (for kerned text)
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

  // If we have positioned text, reconstruct lines
  if (lineSegments.size > 0) {
    const sortedYs = Array.from(lineSegments.keys()).sort((a, b) => b - a); // Top to bottom
    for (const y of sortedYs) {
      const lineTexts = lineSegments.get(y) ?? [];
      if (lineTexts.length > 0) {
        segments.push(lineTexts.join(' '));
      }
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
