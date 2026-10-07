# Uniform Program-Entry Editing Plan

## Goal

Make the Program Designer a usable two-plane editor:

- **Content** edits the authoritative meeting program entries, including the protected Introduction values such as presiding and conducting.
- **Layout** edits `meeting_document` placement, visibility, style, templates, and advanced spatial design.
- **Preview** remains read-only and consumes a public-safe projection.

Every source-backed entry uses the same labeled-row shell. Type-specific fields remain explicit; generated content is marked as managed elsewhere instead of pretending to be editable.

## Architecture decision

Keep `meeting_program_item` as the single source of truth for program content. Do not copy item values into `meeting_document.layout_json` or the generic `ProgramDocument.payload`.

Use this flow:

```text
meeting_program_item
  -> typed source/editor projection
  -> Program Designer Content rows
  -> dedicated program-entry mutation API

meeting_program_item
  -> public-safe projection
  -> layout/document preview, print/PDF, publication snapshot

meeting_program_item
  -> conducting/Stand-safe projection
  -> online and offline conducting views
```

The existing broad meeting PUT remains the meeting-management boundary. It continues to require `canManageMeetings`. The new content API uses `canEditProgramDesign`, active-ward enforcement, and the enabled Programs module; it does not grant broader meeting-management rights.

### Arena synthesis

The four design candidates converged on the dual-plane model, stable persisted IDs, protected structural rows, a narrow source-content API, explicit source-managed states, and separate public/editor projections.

- **Base:** narrow source-backed content API with opaque revision tokens.
- **Grafted:** uniform row shell and explicit Content/Layout UX from the shared-editor and UX candidates; public/private projection rules from the privacy candidate.
- **Rejected for the first slice:** copying entries into layout blocks, broadening `canManageMeetings`, generic JSON patches, create/delete/reorder controls, offline content mutation, and a large MeetingForm extraction. Those follow-up changes need their own verified milestones.

## Source model and rules

Current authoritative row: `meeting_program_item`.

Stable fields:

- `id` UUID: persisted identity; never derive identity from array index or label.
- `sequence`: source order; not client-controlled in the first slice.
- `item_type`: stable internal key; never localize or rewrite it in the client.
- title, topic, hymn number/title/locale, introduction roles, notes, and program notes.
- speaker status remains a source lifecycle field and is not changed by a generic content patch until its transition UI is explicitly designed.

Protected structure remains unchanged:

- Normal ward meetings: one `INTRODUCTION` at position 1 and one `ANNOUNCEMENT` at position 2.
- Stake/general conference: no Introduction and one Announcement at position 1.
- Existing fast-and-testimony restrictions and speaker-status rules remain server-enforced.
- Introduction is structurally fixed but its presiding, conducting, organist, chorister, and visiting-leader values are editable through the parent item.
- Announcements are source-managed by the Announcements workflow. They get a uniform row shell and a management link, not fake editable title/body controls.

## Milestones

### D1 — Content plane and first editable rows (this branch)

Acceptance criteria:

1. Authorized Program Editors can open the Program Designer Content view even when Advanced Layout is disabled.
2. The Content view loads all existing source rows with stable IDs and full editor-safe fields.
3. Introduction renders uniform child rows for presiding, conducting, organist/pianist, and chorister.
4. Ordinary rows expose common title/topic/internal-notes/program-notes fields plus hymn fields where applicable.
5. Program notes are clearly labeled as public output and show a disclaimer before editing.
6. Source-managed announcements are visibly marked and link to Announcements.
7. Content mutations use a dedicated API with strict field allowlists, active-ward/module authorization, row ownership checks, row locking, and an opaque source revision token.
8. Stale writes return a recoverable 409 conflict; local values are retained.
9. Content writes update `meeting_program_item` only and do not write layout, publication, or render tables.
10. Public projections never fall back from `program_notes` to private `notes`.

D1 non-goals:

- Add/delete/reorder controls.
- Speaker lifecycle transitions.
- Announcement CRUD, business-line workflow, or internal-note record management.
- Offline program-item mutation.
- Database migrations or a second renderer.

### D2 — Shared editor convergence

Extract the row shell and type-specific controls into a reusable controlled component used by both Program Designer and MeetingForm. Centralize normalization, protected-item rules, and item persistence helpers. Preserve the broader MeetingForm permission boundary.

### D3 — Ordered collection operations

Add explicit order and collection operations with server-owned contiguous sequences, stable IDs, protected-position validation, and conflict handling. Add/delete only when each item type has a clear owner and output behavior. Remove duplicated route-local persistence logic.

### D4 — Output/privacy hardening

Adopt explicit projections across legacy print, document preview/PDF, publication, At-the-Stand, and offline snapshot. Preserve derived operational fields needed by conducting without exposing raw private notes. Add end-to-end ID/order and private/public regression tests.

### D5 — Capability expansion

Prove the same content/layout/publication contracts with one real non-sacrament program type, starting with baptism programs. Keep event-specific source adapters authoritative and do not extract a separate service until independent consumers justify it.

## D1 implementation map

### Create

- `apps/web/src/meetings/program-item-contracts.ts` — strict editor item, patch, source-revision, and response schemas.
- `apps/web/src/meetings/program-item-source.ts` — canonical source-row mapping, deterministic ordering, and opaque SHA-256 revision computation.
- `apps/web/app/api/w/[wardId]/meetings/[meetingId]/program-items/route.ts` — authenticated editor GET.
- `apps/web/app/api/w/[wardId]/meetings/[meetingId]/program-items/[itemId]/route.ts` — narrow authenticated PATCH.
- Matching route tests.
- `apps/web/components/program-entry-row.tsx` and tests — uniform row shell and explicit managed/fixed states.
- `apps/web/components/program-entries-editor.tsx` and tests — Content plane state, field editors, autosave, retry, and conflict handling.

### Modify

- `apps/web/app/programs/[meetingId]/program-designer-client.tsx` — add Content/Layout separation; remove the read-only program-row list; keep layout save path independent.
- `apps/web/app/programs/[meetingId]/page.tsx` — ordinary Content access must not depend on Advanced Designer availability.
- `apps/web/src/meetings/render.ts` — render only explicit `programNotes`; never fall back to private `notes`.
- `apps/web/src/document-designer/meeting-document-service.ts` — preserve source order and public program notes in the safe preview projection without editor/private fields.
- Existing localized `programs.json` catalogs — Content labels, public-note disclaimer, managed/source states, save/conflict messages.
- `docs/DEPENDENCY_GRAPH.md` — regenerate after implementation.

### Deferred until D2/D3

- `meeting-form.tsx` extraction and route writer convergence.
- Shared route-local persistence helper.
- Meeting item add/delete/reorder from Program Designer.
- Speaker status transition UI.

## API contract

`GET /api/w/{wardId}/meetings/{meetingId}/program-items`

Returns:

```ts
{
  meeting: { id: string; meetingDate: string; meetingType: string };
  sourceRevision: `sr1_${string}`;
  items: EditorProgramItem[];
}
```

The editor response is authenticated and may contain internal editor fields. It must never be reused as public, print, offline, or publication data.

`PATCH /api/w/{wardId}/meetings/{meetingId}/program-items/{itemId}`

```ts
{
  expectedRevision: `sr1_${string}`;
  patch:
    | { kind: 'TEXT'; field: 'title' | 'topic' | 'notes' | 'programNotes'; value: string | null }
    | { kind: 'INTRODUCTION_ROLE'; role: 'presiding' | 'conducting' | 'organist' | 'chorister'; value: string | null }
    | { kind: 'INTRODUCTION_ROLES'; value: IntroductionRoles }
    | { kind: 'HYMN'; number: string | null; title: string | null; locale: string };
}
```

The server rejects unknown keys, sequence/type/ID changes, cross-ward or cross-meeting IDs, patches to source-managed announcements, invalid protected structure, and stale revisions. It locks the meeting and item rows, applies one allowlisted field mutation, recomputes the revision, records sanitized audit metadata, and returns the new safe editor state.

## Privacy contract

- `notes` is internal/operational content and must not enter public output.
- `programNotes` is intentionally public program content and gets a visible warning in the editor.
- Public/print/document preview receives only a public-safe projection. It must not receive source IDs, notes, speaker status, visiting-leader metadata, or business markers.
- At-the-Stand and offline continue to receive separate authenticated projections. No offline content mutation is part of D1.
- Existing immutable published snapshots are not rewritten by D1. New publication output must use the corrected public projection.

## Verification gates

Run separately after each final edit:

1. Focused contracts, projection, API, component, and program-designer tests.
2. Full web unit/component suite plus disposable PostgreSQL/RLS suite.
3. Typecheck.
4. Lint.
5. i18n validation.
6. Production build.
7. Dependency graph generation and check.
8. `git diff --check`.
9. Fresh independent exact-tree review.
10. Authenticated browser acceptance: Content with Advanced off, field save/reload, stale conflict, managed announcement, Layout isolation, and public-preview privacy.

A passing build is not evidence of browser, RLS, publication, or deployment success. Report each state separately.
