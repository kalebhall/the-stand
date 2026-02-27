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

  // Method 1: Try to extract text with positioning using Tm and Tj/TJ operators
  let currentTx = 0;
  let currentTy = 0;
  
  // Find Tm operations (text positioning matrix)
  const tmMatches = stream.matchAll(/([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm/g);
  const positions: Array<{ x: number; y: number; index: number }> = [];
  for (const match of tmMatches) {
    const x = Number.parseFloat(match[5] ?? '0');
    const y = Number.parseFloat(match[6] ?? '0');
    positions.push({ x, y, index: match.index ?? 0 });
  }

  // Find all text show operations (Tj)
  const tjMatches = [...stream.matchAll(/\((?:[^()\\]|\\.)*\)\s*Tj/g)];
  
  // Find all text show array operations (TJ)
  const tjArrayMatches = [...stream.matchAll(/\[([^\]]+)\]\s*TJ/g)];

  // If we found positioned text, try to correlate them
  if (positions.length > 0 && (tjMatches.length > 0 || tjArrayMatches.length > 0)) {
    let posIdx = 0;
    
    // Process Tj operations
    for (const match of tjMatches) {
      const matchIndex = match.index ?? 0;
      
      // Find the most recent Tm before this Tj
      while (posIdx < positions.length - 1 && positions[posIdx + 1]!.index < matchIndex) {
        posIdx++;
      }
      
      const pos = positions[posIdx];
      const textMatch = match[0].match(/\((?:[^()\\]|\\.)*\)/);
      if (textMatch && pos) {
        const text = decodePdfString(textMatch[0].slice(1, -1));
        if (text) {
          textElements.push({ text, x: pos.x, y: pos.y });
        }
      }
    }
    
    // Process TJ operations
    for (const match of tjArrayMatches) {
      const matchIndex = match.index ?? 0;
      
      // Find the most recent Tm before this TJ
      while (posIdx < positions.length - 1 && positions[posIdx + 1]!.index < matchIndex) {
        posIdx++;
      }
      
      const pos = positions[posIdx];
      const arrayContent = match[1] ?? '';
      const stringMatches = arrayContent.matchAll(/\((?:[^()\\]|\\.)*\)/g);
      
      let combinedText = '';
      for (const strMatch of stringMatches) {
        combinedText += decodePdfString(strMatch[0].slice(1, -1));
      }
      
      if (combinedText && pos) {
        textElements.push({ text: combinedText, x: pos.x, y: pos.y });
      }
    }
  }

  // Method 2: If positioned extraction worked, reconstruct with spacing
  if (textElements.length > 0) {
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
      let lineText = '';
      let lastX = -1;
      let lastWidth = 0;
      
      for (let i = 0; i < lineElements.length; i++) {
        const element = lineElements[i];
        if (!element) continue;

        if (i > 0) {
          const gap = element.x - (lastX + lastWidth);
          // If the gap is significant (likely a column break), insert multiple spaces
          if (gap > 20) {
            lineText += '   '; // Triple space for column boundary
          } else if (gap > 2) {
            lineText += ' '; // Normal space
          }
        }
        
        lineText += element.text;
        lastX = element.x;
        lastWidth = element.text.length * 5; 
      }
      
      if (lineText.trim()) {
        segments.push(lineText);
      }
    }

    return segments.join('\n');
  }

  // Method 3: Fallback - simple text extraction without positioning
  for (const match of tjMatches) {
    const textMatch = match[0].match(/\((?:[^()\\]|\\.)*\)/);
    if (textMatch) {
      const text = decodePdfString(textMatch[0].slice(1, -1));
      if (text.trim()) {
        segments.push(text);
      }
    }
  }

  for (const match of tjArrayMatches) {
    const arrayContent = match[1] ?? '';
    const stringMatches = arrayContent.matchAll(/\((?:[^()\\]|\\.)*\)/g);
    
    let combinedText = '';
    for (const strMatch of stringMatches) {
      combinedText += decodePdfString(strMatch[0].slice(1, -1));
    }
    
    if (combinedText.trim()) {
      segments.push(combinedText);
    }
  }

  return segments.join('\n');
}

export async function extractPdfText(fileData: ArrayBuffer): Promise<string> {
  const pdfBuffer = Buffer.from(fileData);
  const source = pdfBuffer.toString('latin1');
  const output: string[] = [];

  // Find all stream objects in the PDF
  const streamPattern = /<<(?:.|\n|\r)*?>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  
  for (const match of source.matchAll(streamPattern)) {
    const dictionary = match[0];
    const rawStream = match[1];
    
    if (!rawStream) continue;
    
    let decoded = Buffer.from(rawStream, 'latin1');

    // Decompress if FlateDecode filter is applied
    if (/\/Filter\s*\/FlateDecode/.test(dictionary)) {
      try {
        decoded = inflateSync(decoded);
      } catch (error) {
        // Skip streams that can't be decompressed
        continue;
      }
    }

    const streamContent = decoded.toString('latin1');
    
    // Only process streams that contain text operators
    if (!/\bTj\b|\bTJ\b/.test(streamContent)) {
      continue;
    }

    const text = extractTextFromStream(streamContent);
    if (text.trim()) {
      output.push(text);
    }
  }

  return output.join('\n');
}