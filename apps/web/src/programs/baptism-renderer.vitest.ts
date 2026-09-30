import { describe, expect, it } from 'vitest';

import { publicBaptismDocument, renderBaptismProgram } from './baptism-renderer';
import type { PersistedBaptismProgramDocument } from './baptism-persistence';

function document(): PersistedBaptismProgramDocument {
  return {
    id: 'baptism-event-program:event-1',
    programType: 'BAPTISM_PROGRAM',
    source: { sourceType: 'BAPTISM_EVENT', sourceId: 'event-1', sourceVersion: '1' },
    schemaVersion: 1,
    metadata: { title: '<script>alert(1)</script>', date: '2026-10-01"><script>alert(4)</script>', location: '<img src=x onerror=alert(2)>' },
    payload: {
      template: 'STANDARD_BAPTISM',
      participantDisplayName: '<b>Participant</b>',
      items: [{ key: 'welcome', label: '<i>Welcome</i>', content: 'A & B <script>alert(3)</script>', sequence: 0 }]
    },
    revision: 1,
    updatedByUserId: 'internal-user',
    updatedAt: new Date('2026-10-01T00:00:00Z')
  };
}

describe('baptism renderer', () => {
  it('escapes every user-controlled field and does not expose audit identity', () => {
    const html = renderBaptismProgram(document());
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('2026-10-01&quot;&gt;&lt;script&gt;alert(4)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(html).toContain('&lt;b&gt;Participant&lt;/b&gt;');
    expect(html).toContain('&lt;i&gt;Welcome&lt;/i&gt;');
    expect(html).toContain('A &amp; B &lt;script&gt;alert(3)&lt;/script&gt;');
    expect(html).not.toContain('internal-user');
    expect(html).not.toContain('<script>alert(1)</script>');
    const publicDocument = publicBaptismDocument(document());
    expect(publicDocument).not.toHaveProperty('updatedByUserId');
    expect(publicDocument).not.toHaveProperty('updatedAt');
    expect(publicDocument).not.toHaveProperty('revision');
    expect(publicDocument).toHaveProperty('payload');
  });

  it('renders a printable document with stable structural elements', () => {
    const html = renderBaptismProgram(document());
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<h1>');
    expect(html).toContain('<ol>');
    expect(html).toContain('noindex,nofollow');
  });
});
