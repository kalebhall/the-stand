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

  // Full spelled-out month date stamps (footer-style: "February 20, 2026")
  // NOTE: short-form dates like "9 Mar 2025" are NOT matched here because they
  // also appear as standalone sustained-date lines within the data. The callers
  // use looksLikeSustainedDateLine() to handle those correctly.
  if (/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},\s+\d{4}$/i.test(normalized)) return true;

  // Page numbers and markers — BUG-FIX: only match 1-2 digit numbers as page
  // numbers; 3-digit numbers (e.g. 100+ page PDFs are unlikely for ward lists)
  // but more critically 2-digit numbers like "65" or "76" are member ages and
  // must NOT be treated as footers.
  //
  // OLD (buggy):  /^\d+$/.test(normalized) && normalized.length <= 3
  // NEW (fixed):  only single-digit standalone numbers are page numbers
  //
  // Callers that need to distinguish ages from page numbers use looksLikeAgeLine()
  // which additionally bounds the value to 1–120.
  if (/^\d$/.test(normalized)) return true;  // single digit page numbers (p. 1–9)
  if (/^\.{3,}$/.test(normalized)) return true;
  if (/^page\s+\d+/i.test(normalized)) return true;

  // Count/total rows
  if (/^(count|total)\s*:\s*\d*/i.test(normalized)) return true;

  return false;
}
