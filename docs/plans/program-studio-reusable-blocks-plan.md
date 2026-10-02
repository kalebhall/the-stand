# Program Studio and Reusable Blocks Plan

## Goal

Improve the existing Program Designer into a constrained, volunteer-friendly Program Studio while preserving the current document model, shared print/digital renderer, publication snapshots, offline behavior, ward isolation, and sacrament-meeting conducting core.

The Studio will support reusable ward content without becoming a freeform website builder or a second program system.

## Product decision

Use Canva's editing metaphor, not unrestricted Canva layout behavior:

- Left: structured section/block library.
- Center: realistic page canvas and preview.
- Right: contextual properties inspector.
- Output modes: edit, digital, mobile, and print.
- Layout remains constrained by approved block types, page regions, columns, widths, and print validation.
- One document model produces print and digital output.

Templates control page composition and theme. Reusable blocks provide recurring content inside a template. Meeting/source adapters remain authoritative for meeting data.

## Existing capabilities to preserve

- `DocumentLayout` and advanced layout schema.
- Typed block registry and public-safety rules.
- Simple and advanced editor modes.
- Undo/redo and optimistic revisions.
- Print, digital, and mobile previews.
- Print validation and PDF output.
- Template lifecycle, versioning, locks, distribution policy, and publication.
- Immutable published snapshots.
- Public-safe rendering and ward-scoped authorization.
- Offline lifecycle and cleanup behavior.

## Reusable block model

### Block categories

Core/source-driven blocks:

- Program title and date.
- Ward name.
- Meeting information.
- Presiding and conducting.
- Music and speakers.
- Ward and Stake Business.
- Announcements.
- Meeting program.

Reusable content blocks:

- Custom text.
- Image.
- Divider.
- Spacer.
- QR code.
- Approved external link.
- Future grouped section.

### Static versus source-driven

Static reusable blocks contain saved, approved content such as a recurring welcome, contact information, disclaimer, or QR link.

Source-driven blocks contain a typed reference to safe data such as ward name, meeting date, public portal URL, announcements, or the meeting program. They resolve at render time and never copy private member or meeting records into the reusable block.

### Scope

- `PERSONAL`: visible only to its creator.
- `WARD`: available to authorized program editors in one ward.
- `STAKE`: available to authorized stake template/program users.
- `SYSTEM`: built-in and locked; not user-created.

Every scoped record includes ward/stake ownership as applicable and is protected by application authorization plus PostgreSQL RLS.

### Version behavior

Reusable block updates never silently change an existing draft or published program:

1. Insert a specific reusable-block version into a program.
2. Preserve that version in the document draft.
3. Publishing materializes an immutable snapshot.
4. If a newer reusable version exists, show `New version available`.
5. Updating requires an explicit operator action.

## Delivery milestones

### Milestone 0 — Contract and UI inventory

- Document the Studio model and ownership boundaries.
- Inventory existing block types, render targets, template routes, and editor operations.
- Confirm no new persistence table is required for the visual shell.
- Define reusable-block payload and privacy rules.

Gate: architecture review, dependency graph check, no runtime behavior change.

### Milestone 1 — Program Studio shell refresh

- Replace the technical three-column presentation with a polished Studio shell.
- Add clear toolbar with save state, template name, undo/redo, preview mode, and publish actions.
- Improve canvas to resemble paper with page boundaries, spacing, and zoom.
- Add page thumbnails or panel navigation for bifold documents.
- Keep existing APIs and document persistence unchanged.

Gate: focused component tests, typecheck, lint, build, browser editor acceptance.

### Milestone 2 — Categorized block library and contextual inspector

- Group blocks into Core sections, Reusable blocks, Media, and Links/QR.
- Add friendly labels, descriptions, icons, and empty states.
- Replace raw technical fields with content-oriented controls.
- Move advanced width/column/layout settings behind an advanced disclosure.
- Preserve keyboard move controls and accessible focus states.

Gate: keyboard and responsive browser acceptance; no new authorization surface.

### Milestone 3 — Real template previews

- Generate actual template thumbnails using the existing render contract.
- Improve gallery cards with page count, paper/orientation, theme, scope, lock, and version.
- Improve template detail with preview, use-as-is, and duplicate/customize flows.
- Keep system/stake source templates locked according to existing permissions.

Gate: template gallery/detail browser tests and public-safety review.

### Milestone 4 — Reusable block persistence and library

- Add a forward migration for reusable block metadata and immutable versions.
- Add ward/stake/personal scope checks, RLS, indexes, and audit identity.
- Add runtime payload validation and explicit public-safe projection.
- Add list/create/update/archive/version APIs.
- Add `Save as reusable block`, `Insert reusable block`, and library filtering.
- Support existing safe primitives first: custom text, image, divider, spacer, QR, and approved link.

Gate: live PostgreSQL/RLS, ward isolation, authorization, malformed payload, and version tests.

### Milestone 5 — Source-driven reusable blocks

- Add typed source references for ward/meeting/public-portal values.
- Resolve values through adapters at render time.
- Keep member IDs, private notes, unpublished assignments, and internal audit metadata out of reusable content.
- Add stale/source-version handling where source data can change.

Gate: adapter contract tests, privacy tests, public projection tests, and browser output tests.

### Milestone 6 — Update-from-version workflow

- Show the version used by each inserted block.
- Detect newer versions without changing the document.
- Provide explicit update/keep-current actions.
- Record the selected reusable version in draft and publication metadata.

Gate: optimistic concurrency, immutable publication, rollback, and offline behavior tests.

### Milestone 7 — Template Studio

- Allow authorized ward/stake users to compose and publish approved templates.
- Allow template-owned block arrangement, theme, typography, and output behavior.
- Keep system templates immutable.
- Validate print layout and digital accessibility before publishing.

Gate: complete template lifecycle, authorization, audit, and cross-ward tests.

### Milestone 8 — Safe digital extensions

- Add QR/link block workflows first.
- Validate HTTPS URLs and visible labels.
- Add optional print-only/digital-only behavior.
- Defer arbitrary embeds, forms, maps, and third-party scripts until a separate privacy/security review.

Gate: URL safety, public snapshot, rate-limit/abuse, accessibility, and print validation tests.

## Data and security rules

- Do not store arbitrary HTML, JavaScript, or executable content.
- Do not allow reusable blocks to contain member IDs, private notes, unpublished calling data, or ordinance records.
- Public output is always generated from an explicit safe projection and an immutable publication snapshot.
- Public links remain opaque, revocable/expiring where applicable, and rate-limited.
- Every ward/stake query includes ownership predicates and transaction-local database context.
- Existing templates and meeting documents remain compatible throughout the migration.
- Existing sacrament program behavior remains the protected fallback when optional Studio features are unavailable.

## First implementation slice

Start with Milestone 1 and the safe portion of Milestone 2:

1. Add the Studio plan and contract documentation.
2. Add a typed reusable-block catalog contract without persistence.
3. Refactor the editor block library into categorized groups using the existing block registry.
4. Improve the canvas toolbar and page/panel navigation.
5. Add focused UI tests before any database migration.

Do not add reusable-block persistence until the visual workflow is proven and the contract has focused tests.

## Acceptance criteria

A program editor can:

- Understand the editor without training.
- See a realistic print-oriented page.
- Switch between edit, digital, mobile, and print views.
- Find blocks by category and understand what each does.
- Select, reorder, hide, configure, and preview a block.
- Save a custom block for later reuse once Milestone 4 lands.
- See template scope, lock, version, and policy clearly.
- Publish only an immutable, public-safe snapshot.

All existing meeting, conducting, publication, offline, privacy, ward-isolation, and authorization acceptance tests must remain green.
