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
  
  // Track text elements with their positions
  type TextElement = { text: string; x: number; y: number };
  const textElements: TextElement[] = [];

  // Use a more robust approach: find all Tm operations and the text operations that follow them
  // Fixed regex to properly handle escaped characters in PDF strings
  const operationRegex = /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm|(\((?:[^()\\]|\\.)*\))\s*Tj|\[((?:[^\[\]]|\((?:[^()\\]|\\.)*\))*)\]\s*TJ/g;
  
  let currentTx = 0;
  let currentTy = 0;
  
  let match;
  while ((match = operationRegex.exec(stream)) !== null) {
    if (match[6] !== undefined) {
      // It's a Tm operation (match[5] is x, match[6] is y)
      currentTx = Number.parseFloat(match[5] ?? '0');
      currentTy = Number.parseFloat(match[6] ?? '0');
    } else if (match[7] !== undefined) {
      // It's a Tj operation - simple string
      const text = decodePdfString(match[7].slice(1, -1));
      if (text.trim() || text === ' ') {
        textElements.push({ text, x: currentTx, y: currentTy });
      }
    } else if (match[8] !== undefined) {
      // It's a TJ operation - array of strings and numbers
      const arrayContent = match[8];
      const stringMatches = Array.from(arrayContent.matchAll(/\((?:[^()\\]|\\.)*\)/g));
      
      let combinedText = '';
      for (const strMatch of stringMatches) {
        combinedText += decodePdfString(strMatch[0].slice(1, -1));
      }
      
      if (combinedText.trim() || combinedText === ' ') {
        textElements.push({ text: combinedText, x: currentTx, y: currentTy });
      }
    }
  }

  // If we couldn't extract positioned text properly, fall back to simple text extraction
  if (textElements.length === 0) {
    const tjMatches = stream.matchAll(/\((?:[^()\\]|\\.)*\)\s*Tj/g);
    for (const match of tjMatches) {
      const token = match[0].replace(/\s*Tj$/, '');
      segments.push(decodePdfString(token.slice(1, -1)));
    }

    const tjArrayMatches = stream.matchAll(/\[((?:[^\[\]]|\((?:[^()\\]|\\.)*\))*)\]\s*TJ/gs);
    for (const match of tjArrayMatches) {
      const arrayContent = match[1] ?? '';
      const strings = Array.from(arrayContent.matchAll(/\((?:[^()\\]|\\.)*\)/g)).map((item) =>
        decodePdfString(item[0].slice(1, -1))
      );
      if (strings.length) {
        segments.push(strings.join(''));
      }
    }
    
    return segments.join('\n');
  }

  // Group text elements by line (Y coordinate, with some tolerance)
  const lines: Map<number, TextElement[]> = new Map();
  const Y_TOLERANCE = 2.0;

  for (const element of textElements) {
    let foundLineY = -1;
    for (const y of lines.keys()) {
      if (Math.abs(y - element.y) < Y_TOLERANCE) {
        foundLineY = y;
        break;
      }
    }

    if (foundLineY === -1) {
      lines.set(element.y, [element]);
    } else {
      lines.get(foundLineY)?.push(element);
    }
  }

  // Sort lines from top to bottom (larger Y is higher in PDF coordinate system)
  const sortedY = Array.from(lines.keys()).sort((a, b) => b - a);
  
  for (const y of sortedY) {
    const lineElements = lines.get(y) ?? [];
    
    // Sort elements in the line from left to right
    lineElements.sort((a, b) => a.x - b.x);
    
    // Reconstruct the line text with proper spacing
    // If elements are far apart, insert tab-like large spaces to maintain column structure
    let lineText = '';
    let lastX = -1;
    let lastWidth = 0;
    
    for (let i = 0; i < lineElements.length; i++) {
      const element = lineElements[i];
      if (!element) continue;

      if (i > 0) {
        const gap = element.x - (lastX + lastWidth);
        // If the gap is significant (likely a column break), insert multiple spaces
        // PDF units are typically points (1/72 inch). 20 points is a good threshold for a column.
        if (gap > 20) {
          lineText += '   '; // Use triple space to denote column boundary
        } else if (gap > 2) {
          lineText += ' '; // Normal space
        }
      }
      
      lineText += element.text;
      lastX = element.x;
      // Estimate width based on character count (rough approximation, ~5 units per char)
      lastWidth = element.text.length * 5; 
    }
    
    if (lineText.trim()) {
      segments.push(lineText);
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