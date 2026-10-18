# Program Blocks and Display Options — Examples Mapping

## Status

B1 and B2 are implemented and independently reviewed. B3 is implemented; focused and full local verification passes, with a fresh exact-tree review required before merge. Tagalog and Tongan additions have locale-key parity, but native-speaker review remains pending. This document is a specification and does not itself change runtime behavior.

## User decisions

- Extend The Stand's existing Program Studio and document model.
- Use the same canonical program content for print/PDF and web.
- Mobile web must render in one column.

## What the examples demonstrate

The supplied examples combine a sacrament-meeting agenda with a bulletin. They use:

- A cover with program title, date, ward identity, and optional artwork.
- Agenda rows pairing role/item labels with names or details; dotted leaders and centered/stacked treatments are both useful.
- Hymn rows where a number and title can be shown together.
- Announcements with date/time, title, description, location, contact, and occasional bullet details.
- Separate bulletin material such as events, lesson schedules, birthdays, missionary information, contacts, assignments, and short quotations.
- Folded or multi-column print composition, while the content itself still has a readable sequence.

These are layout/content examples, not policy sources. Any personal or contact detail must be deliberately approved for public output.

## Existing model and gaps

The current implementation already has a typed `SACRAMENT_PROGRAM` registry and these relevant block types:

- Meeting: `DOCUMENT_TITLE`, `WARD_NAME`, `MEETING_INFO`, `MEETING_PROGRAM`, `PRESIDING_CONDUCTING`, `MUSIC_LEADERS`, `SPEAKERS`, `WARD_STAKE_BUSINESS`.
- Bulletin content: `ANNOUNCEMENTS`, `UPCOMING_EVENTS`, `CALENDAR`, `THIS_WEEK`, `SUNDAY_LESSONS`, `YOUTH_ACTIVITIES`, `PRIMARY_ACTIVITIES`, `MISSIONARIES_SERVING`, `WARD_CONTACT`, `SCRIPTURE`, `QUOTE`.
- Generic content/media: `CUSTOM_TEXT`, `IMAGE`, `DIVIDER`, `SPACER`, `QR_CODE`, `CUSTOM_LINK`.

Most bulletin blocks are currently generic text configurations. This supports paragraphs, but not structured event fields or per-item options. `MEETING_PROGRAM` already renders source-backed items as label/value rows. The shared block renderer supports global/advanced styling, and advanced blocks can have font, alignment, spacing, and border overrides. It does not yet expose the example-specific agenda/announcement presentation variants as block-level choices.

The HTML renderer already collapses folded panels to one column under a narrow viewport. However, the same media rule does not explicitly collapse advanced region columns or the two-column key/value rows. The mobile requirement must cover the entire rendered content, not only folded panels.

## Proposed block additions

Add only blocks that provide meaningfully structured content rather than creating another generic text alias:

1. **Section heading** — title plus optional subtitle; supports clear bulletin sections and named agenda groupings.
2. **Announcement/event list** — ordered items with optional date, time, title, description, location, and contact label. Each optional field is explicit; no member/contact records are implicitly fetched.
3. **Simple list** — ordered or unordered short items for assignments, birthdays, or schedules where a date/title pair is insufficient. Keep it manual and public-safe in the first slice.

Continue using the existing `SCRIPTURE`, `QUOTE`, `WARD_CONTACT`, and `MISSIONARIES_SERVING` blocks for now; improve their labels/descriptions and presentation rather than adding duplicate block types. Keep `WARD_LEADERSHIP` and `MISSIONARIES_ASSIGNED` internal-only. Do not make private records public through a new block.

## Proposed display options

Persist a small typed presentation choice as block configuration, not arbitrary HTML/CSS:

| Block                   | Options                                             | Default        |
| ----------------------- | --------------------------------------------------- | -------------- |
| Meeting program         | `LABEL_VALUE`, `DOTTED_LEADERS`, `CENTERED_STACKED` | `LABEL_VALUE`  |
| Announcement/event list | `COMPACT_ROWS`, `DETAIL_CARDS`                      | `COMPACT_ROWS` |
| Section heading         | `PLAIN`, `RULE`, `ACCENT`                           | `RULE`         |
| Simple list             | `BULLETS`, `NUMBERED`, `COMPACT_ROWS`               | `BULLETS`      |

Print and digital renderers must interpret each option consistently. Preserve the existing advanced typography/alignment/border controls as additional appearance overrides; they do not replace semantic display variants. Templates continue to control page composition and theme, not duplicate block content.

## Output contract

- Use the existing program document and registry; no second builder, content store, or rendering pipeline.
- Each structured block stores only the fields it owns. Meeting agenda content remains sourced from the authoritative meeting-program projection; do not copy it into an unrelated static block.
- Reuse the same public-safe block projection for mobile web, desktop web, print HTML, PDF, and publication snapshots.
- Mobile web forces one column for document panels, advanced columns, and label/value rows. Keep labels associated with values and preserve reading order. This mobile rule must not alter print imposition or persisted print layout.
- Draft edits do not silently rewrite an existing published snapshot. Publishing/republishing remains explicit.
- Contact and recognition lists are static, intentionally authored public content in this milestone. Never query private member details to populate them.

## Delivery sequence

### B1 — Display variants and mobile contract

- Add typed display variants for `MEETING_PROGRAM` and render them through the existing shared HTML and PDF renderer contracts.
- Add the corresponding contextual Program Studio controls and localized labels.
- Enforce one-column mobile presentation for panels, advanced columns, and key/value rows.
- Keep old persisted layouts valid by defining and testing an explicit default for missing presentation values; version the block schema contract as required by the registry.

### B2 — Structured announcement/event list

- Add an `ANNOUNCEMENT_LIST` block with bounded typed item fields and order.
- Add editor controls for adding/editing/removing/reordering items within this block, subject to existing document/block locks.
- Render both compact rows and detail cards in web and PDF from the same validated block data.
- Keep all fields explicitly public; do not read from private announcement notes or member records.

### B3 — Section heading and simple list

- Add the two remaining reusable structural blocks, registry definitions, UI controls, and shared renderer support.
- Add catalog discoverability with localized descriptions and keyboard-accessible insertion.
- Verify these blocks survive save, reload, template insertion, preview, publication, and legacy compatibility projection.

## Required verification

For each milestone, test schema validation and old-document parsing, block insertion/edit/save/reload, lock rejection, keyboard operation, localization parity, and exact rendered content. Compare the same fixture through digital HTML, narrow/mobile HTML, print HTML, and PDF. Include long content, blank optional fields, multiline details, unsafe markup, public/private sentinel values, and a private block that must remain excluded. Verify PDF text/layout rather than inferring it from HTML tests. Run the repository's focused tests, typecheck, lint, `npm run i18n:validate`, dependency-graph check, build, and a fresh exact-tree review before claiming a milestone complete.

## Implementation files likely involved

- `apps/web/src/document-designer/constants.ts`
- `apps/web/src/document-designer/types.ts`
- `apps/web/src/document-designer/sacrament-program.ts`
- `apps/web/src/document-designer/block-renderers.ts`
- `apps/web/src/document-designer/renderer.ts`
- `apps/web/src/document-designer/pdf-renderer.ts`
- `apps/web/app/programs/[meetingId]/program-designer-client.tsx`
- Program Designer component/domain tests and every supported `messages/*/programs.json` catalog.

No persistence migration is assumed for this design phase. Any implementation must first verify how existing strict block configs and schema-contract identities are versioned, then preserve legacy layouts without data loss.
