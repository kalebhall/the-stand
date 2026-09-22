# Program Designer Spatial Canvas

## Status

Implemented on branch `feat/spatial-program-designer`; awaiting PR publication after final verification.

## Goal

Make the meeting program designer represent the physical bi-fold program instead of only showing a vertical list of blocks.

The editor must expose four placement targets:

- Front cover
- Inside left
- Inside right
- Back cover

Users must be able to add blocks, remove blocks, drag blocks between panels, reorder blocks within a panel, and preview each panel in its print position.

## Current repository facts

- UI: `apps/web/app/programs/[meetingId]/program-designer-client.tsx`
- Current modes: `EDIT`, `DIGITAL`, `PHONE`, `PRINT` in `designer-state.ts`.
- Current edit canvas renders `allBlocks` as one vertical list.
- Advanced controls currently provide add text, remove selected, reorder, columns, undo/redo, and save.
- Advanced layout already has pages, regions, columns, block IDs, block widths, and fold metadata:
  - `apps/web/src/document-designer/advanced-schema.ts`
  - `apps/web/src/document-designer/types.ts`
  - `apps/web/src/document-designer/layout-operations.ts`
- Existing renderer already preserves page/region structure:
  - `apps/web/src/document-designer/preview-contract.ts`
  - `apps/web/src/document-designer/renderer.ts`
- Existing API persists simple and advanced layouts at:
  - `apps/web/app/api/w/[wardId]/meetings/[meetingId]/program-design/route.ts`
- Existing server-side lock enforcement must remain authoritative:
  - `apps/web/src/document-designer/lock-enforcement.ts`

## Root issue classification

This is primarily a missing spatial-editor capability, not merely a broken button:

1. The edit canvas has no panel/drop-zone model.
2. `allBlocks` flattens all pages and regions for display.
3. Existing `addBlock` and `removeBlock` operate on the advanced document but do not expose panel selection or drag/drop in the UI.
4. Locked operations can throw from event handlers without a visible error state.
5. The current preview modes render output but do not show physical panel boundaries for a bi-fold layout.

## Proposed data model

Prefer the existing advanced layout model. Do not add a second panel-placement model.

- Model a bi-fold as one physical sheet with four logical panels represented by stable page/region IDs or an explicit panel metadata mapping.
- Preserve stable document/page/region/block IDs.
- Keep `columns.blockIds` authoritative for within-region placement.
- Add only the minimum metadata needed to distinguish front, inside-left, inside-right, and back when the existing `fold`/page structure cannot do so unambiguously.
- Define print order separately from editor panel order. For a bi-fold, verify outside/inside imposition against the existing print renderer before changing persistence.
- Keep public and digital projections data-driven from the canonical layout.

## Implementation slices

### 1. Layout contract and panel mapping

Inspect and document the existing fold/page/region semantics in:

- `apps/web/src/document-designer/constants.ts`
- `apps/web/src/document-designer/schema.ts`
- `apps/web/src/document-designer/advanced-schema.ts`
- `apps/web/src/document-designer/renderer.ts`
- print/PDF routes and tests

Add a typed panel mapping helper if needed, with validation for exactly four bi-fold panels and deterministic print order. Avoid UI-only panel names.

### 2. Safe layout operations

Extend `layout-operations.ts` with explicit panel operations if existing region/column operations are insufficient:

- Add block to panel
- Remove block
- Move block between panels
- Reorder within panel
- Reject locked panel/block operations with stable, user-safe errors

Keep all lock checks in the operation helper and server `assertNoLockedChanges` path.

### 3. Spatial editor UI

Refactor `program-designer-client.tsx` into focused components, likely:

- Block palette/list
- Bi-fold canvas
- Panel drop zone
- Block card
- Properties panel
- View/preview toolbar

Requirements:

- Render four visible panel targets in edit mode.
- Drag and drop must have a keyboard-accessible alternative.
- Selecting a panel establishes the target for “Add block.”
- Selected blocks expose remove only when permitted.
- Locked blocks/panels show disabled controls and the lock reason.
- Operation failures appear in the existing status/message area or a dedicated alert.
- Switching Edit/Desktop/Phone/Print and Advanced/Simple must preserve the current local draft and not silently reload or discard it.
- Preview must identify the active panel or show the complete physical sheet, not only a flat block list.

### 4. Persistence and compatibility

- Keep `PUT /program-design` as the server boundary unless the data contract requires a new route.
- Preserve v1 compatibility projections through `downgradeToV1`.
- Ensure Simple Mode edits merge into v2 without removing panel assignments or advanced metadata.
- Preserve revision conflict behavior.
- Confirm template locks remain enforced and that “duplicate/customize” is the supported path for locked source templates.

### 5. Print/public/offline fan-out

Verify the new placement model through:

- Authenticated edit view
- Desktop/digital preview
- Phone preview
- Print preview
- Draft PDF
- Published PDF
- Public snapshot rendering
- Offline snapshot if program design is included in the offline contract

Do not expose private editor metadata in public output.

## Tests to add/update

### Unit/domain

- Four-panel bi-fold mapping and print order.
- Add block to each panel.
- Move block between panels.
- Reorder inside a panel.
- Remove unlocked block.
- Reject removal/move/add under document, page, region, or block locks.
- Stable IDs through v1 → v2 → v1 compatibility round trips.

### Component

- Four panel drop zones render.
- Add targets the selected panel.
- Drag/drop updates the correct panel.
- Keyboard move alternative works.
- Remove works for unlocked blocks.
- Locked controls are disabled and explain why.
- Edit/Desktop/Phone/Print switching works.
- Advanced/Simple switching preserves the draft.
- Save failure/conflict is visible and does not discard local changes.

### Route/RLS

- Authorized ward editor can save panel placement.
- Unauthorized/cross-ward requests are rejected.
- Revision conflicts remain 409.
- Locked source-template changes are rejected server-side.
- Public output contains rendered content only, not editor/panel lock metadata.

### Browser/E2E

Use a disposable PostgreSQL database and actual application runtime role. Exercise a real authenticated meeting with a bi-fold layout, drag/drop or keyboard placement, save, reload, preview, print, and public projection.

## Non-goals

- Do not redesign the entire program template administration workflow.
- Do not weaken template locks to make source templates editable.
- Do not introduce arbitrary free-form desktop-publishing positioning unless explicitly approved; use panel/region/block placement first.
- Do not change official Church program policy or wording.
- Do not claim print correctness from a browser screenshot alone; verify PDF/page output separately.

## Verification gates

Run separately:

```text
focused document-designer tests
component tests
route tests
full test suite
typecheck
lint
production build
dependency graph check
git diff --check
browser/E2E acceptance
live migration/RLS verification
```

Do not deploy until the spatial editor behavior, persistence, print order, public projection, and lock boundaries are each verified.

## Open decisions before implementation

1. Confirm whether “front/inside-left/inside-right/back” means a true bi-fold physical sheet or four logical content areas on a single program document.
2. Confirm whether freeform drag/drop is required or whether snapping blocks to panel/region columns is sufficient for the first version.
3. Confirm whether existing locked source templates should remain read-only and require duplication before panel editing.
