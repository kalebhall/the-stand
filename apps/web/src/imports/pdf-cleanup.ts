export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function isHeaderOrFooterLine(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  
  // Single-word column headers
  if (/^(name|gender|age|organization|calling|sustained)$/i.test(normalized)) return true;
  if (/^(birth\s*date|phone\s*number|e[\s-]*mail|set\s*apart)$/i.test(normalized)) return true;
  
  // Multi-column header combinations
  if (/^(gender\s+age|age\s+birth|birth\s+date\s+phone|phone\s+e[\s-]*mail|organization\s+calling|calling\s+sustained|sustained\s+set\s+apart)$/i.test(normalized)) return true;
  if (/^name\s+gender\s+age/i.test(normalized)) return true;
  
  // Report titles
  if (/^(member\s+list|individuals|members\s+with\s+callings)$/i.test(normalized)) return true;
  
  // Ward/Stake organizational headers (generic patterns)
  if (/\bward\s*\(\d+\)/i.test(normalized)) return true;
  if (/\bstake\s*\(\d+\)/i.test(normalized)) return true;
  if (/\b(ward|stake)\b/i.test(normalized) && normalized.split(/\s+/).length <= 4) return true;
  
  // Footer patterns
  if (/^for\s+church\s+use\s+only/i.test(normalized)) return true;
  if (/^©\s*\d{4}\s+by\s+intellectual\s+reserve/i.test(normalized)) return true;
  if (/all\s+rights\s+reserved/i.test(normalized)) return true;
  
  // Date stamps
  if (/^\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}$/i.test(normalized)) return true;
  if (/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},\s+\d{4}$/i.test(normalized)) return true;
  
  // Page numbers and markers
  if (/^\.{3,}$/.test(normalized)) return true;
  if (/^\d+$/.test(normalized) && normalized.length <= 3) return true;
  if (/^page\s+\d+/i.test(normalized)) return true;
  
  // Count/total rows
  if (/^(count|total)\s*:\s*\d*/i.test(normalized)) return true;
  
  return false;
}
