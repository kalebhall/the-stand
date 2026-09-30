import type { PersistedBaptismProgramDocument } from './baptism-persistence';

type BaptismDocument = PersistedBaptismProgramDocument;

export function escapeBaptismHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

export function publicBaptismDocument(document: BaptismDocument) {
  return { id: document.id, programType: document.programType, source: document.source, schemaVersion: document.schemaVersion, metadata: document.metadata, payload: document.payload };
}

export function renderBaptismProgram(document: BaptismDocument): string {
  const payload = document.payload;
  const items = payload.items.map((item) => `<li><strong>${escapeBaptismHtml(item.label)}</strong>${item.content ? `<div>${escapeBaptismHtml(item.content)}</div>` : ''}</li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>${escapeBaptismHtml(document.metadata.title)}</title><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:3rem auto;padding:0 1rem;line-height:1.5}h1{margin-bottom:.25rem}dl{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1rem}dt{font-weight:700}li{margin:.75rem 0}</style></head><body><h1>${escapeBaptismHtml(document.metadata.title)}</h1><dl><dt>Date</dt><dd>${escapeBaptismHtml(document.metadata.date)}</dd>${document.metadata.location ? `<dt>Location</dt><dd>${escapeBaptismHtml(document.metadata.location)}</dd>` : ''}<dt>Participant</dt><dd>${escapeBaptismHtml(payload.participantDisplayName)}</dd></dl><ol>${items}</ol></body></html>`;
}
