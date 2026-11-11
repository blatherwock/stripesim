# Implementation plan: saved patterns sidebar

Implements `../specs/0003-saved-patterns.md`.

## Overview

Add a collapsible 150 px sidebar as a third column on the right: a save button that prepends cards of the current pattern parameters, per-card restore, per-card save (overwrite), per-card delete, and drag-and-drop reordering. Cards and the page theme persist through `localStorage`, each under its own key; the sidebar's collapsed state persists too. New code lands in two modules, `src/saved.ts` (types, pure list transitions, persistence) and `src/sidebar.ts` (card UI), plus wiring in `src/main.ts`, a small refactor in `src/render.ts`, and styles in `src/style.css`.

The spec's one remaining `[proposed]` item (the storage layer owns list order as a plain array) is the design this plan implements; the sidebar re-reads the full list after every change.

## Task list

### Phase 1: saved model and storage layer

- [x] Task 1: types and pure list transitions in `src/saved.ts`
  - `PatternParams` (the `PatternState` fields minus `theme`), `SavedPattern = { id, params }`, `paramsOf(state)` and `withParams(state, params)` (strip and re-merge the theme), and pure transitions: `createSaved` (append with a fresh id; the initial prepend position was revised by `0004-import-export.md`), `overwriteSaved` (replace one id's params in place), `removeSaved` (drop by id), `moveSaved` (array move by index; refactor `moveStripe`'s splice logic into a shared `moveItem` helper in `src/model.ts` and delegate both to it). Unit tests in `src/saved.test.ts`.
  - Satisfies spec scenarios: saved-pattern storage (IPO)
- [x] Task 2: persistence in `src/saved.ts`
  - `loadSaved()`: parse the stored JSON, validate each item, drop invalid items and keep the rest; a parse failure yields an empty list. `writeSaved(list)`: persist and return success; catch quota and unavailable-storage errors and return failure. Theme helpers `loadTheme()` (one of the four theme names or null) and `storeTheme(theme)`; collapsed-state helpers `loadCollapsed()` (boolean or null) and `storeCollapsed(value)`. All helpers take an injectable storage object (the `Storage` interface) so tests can pass fakes; production passes `window.localStorage`. Keys: `stripe-planner.saved`, `stripe-planner.theme`, `stripe-planner.sidebar-collapsed`.
  - Satisfies spec scenarios: persistence (normal, failure handling and edge cases), theme persistence (failure handling and edge cases), collapsing (invalid stored value), saving (failure handling, the write-failure flag)

### Checkpoint: storage layer green

- [x] `just fix`, `just check`, and `just test` pass; `src/saved.test.ts` covers the transitions, per-item validation, parse failure, write failure, and the theme and collapsed helpers.

### Phase 2: sidebar UI

- [x] Task 3: thumbnail fitting in `src/render.ts`
  - Extract the fit computation from `previewScale` into an exported `fitScale(swatch, box)` (pixels per unit fitting the swatch into a box, no fraction); `previewScale` becomes `0.85 * fitScale`. The sidebar uses `fitScale` directly so thumbnails fill a fixed card box at 1.0 rather than inheriting the preview's 85% fraction.
  - Satisfies spec scenarios: saving (thumbnail matches the preview), overwriting (thumbnail changes)
- [x] Task 4: card list in `src/sidebar.ts`
  - `buildSidebar(host, deps)`: a header row with the collapse toggle and the header save button; a scrollable list of cards; each card is a thumbnail canvas plus a hover-revealed button pair (floppy-disk save above trash-can delete, right side). Clicking a card calls back with its params to restore; the header save and card save call back with create or overwrite intents; delete calls back with the id. Every intent flows through one `onChange` callback; the host rebuilds from the storage layer's list, mirroring `buildPanel`'s rebuild pattern. Drag-and-drop reorders cards with the same indicator treatment as the stripe rows, reusing the exported `dropTargetIndex` from `src/ui.ts` with card-specific wiring. A `canSave` flag (from the storage layer's write health) disables both save buttons. Tests in `src/sidebar.test.ts` follow the `ui.test.ts` harness pattern, including the `makeDragEvent` helper for reorder tests.
  - Satisfies spec scenarios: saving (normal), overwriting (normal, edge cases), card buttons (normal operation), restoring (normal, edge cases), deleting (normal), reordering (normal), collapsing (normal operation)

### Checkpoint: sidebar green

- [x] `just fix`, `just check`, and `just test` pass; `src/sidebar.test.ts` covers create, overwrite, restore, delete, reorder, button order and placement, and the disabled save buttons.

### Phase 3: wiring and styling

- [x] Task 5: wire the sidebar and persistence in `src/main.ts`
  - Add the sidebar column to the layout after the pane. On load, seed the theme from `loadTheme()` falling back to the preferred scheme, and the collapsed state from `loadCollapsed()` falling back to expanded. Theme changes write through `storeTheme` (write failures apply the theme for the session and surface nothing); collapse toggles write through `storeCollapsed`. Restore dispatches `withParams(state, card.params)` as a structure change so conditional panel rows rebuild; sidebar intents (create, overwrite, delete, reorder) apply through the `src/saved.ts` transitions and `writeSaved`, and the sidebar rebuilds only when the write succeeded (otherwise it flags the save buttons disabled). Extend `src/main.test.ts` with localStorage seeded per test and cleared in `afterEach`.
  - Satisfies spec scenarios: theme persistence (normal, failure handling and edge cases), collapsing (normal operation, persistence across reload), persistence (normal), saving failure handling (disabled buttons)
- [x] Task 6: styles for the sidebar in `src/style.css`
  - The 150 px column with a scrolling card list; the collapsed rail with its expand button; card chrome (border, hover state, thumbnail canvas); the hover-revealed button pair pinned to the card's right edge, save above delete; drop indicators matching the stripe rows. Colors derive from the existing theme variables only.
  - Satisfies spec scenarios: collapsing (normal operation), card buttons (normal operation)

### Checkpoint: app green

- [x] `just fix`, `just check`, and `just test` pass (107 tests).
- [ ] A manual browser pass confirms the layout (three columns, 150 px sidebar, collapse to rail), hover behavior, and reload persistence; run `just dev` on the host, since the dev server recipe is host-only.

## Risks and mitigations

| Risk                                                                                     | Impact | Mitigation                                                                                                            |
| ---------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| happy-dom returns null for canvas 2D contexts, so thumbnail pixels cannot be asserted    | Low    | Sidebar tests assert canvas presence and size, not drawn pixels; `renderPattern` callers already guard a null context |
| DragEvent construction and `dataTransfer` are partially supported in happy-dom           | Low    | Mirror the existing `makeDragEvent` helper from `ui.test.ts`, which the stripe reorder tests already use successfully |
| `mount` reads the shared `window.localStorage`, leaking state between main tests         | Med    | Main tests seed and clear storage explicitly in `afterEach`; sidebar and saved tests use injected fakes               |
| The `moveStripe` refactor to a shared `moveItem` touches working stripe reorder behavior | Low    | The refactor keeps the exact splice semantics; existing `model.test.ts` and `ui.test.ts` reorder tests pin it         |

## Open questions

None.

## Related documents

- Spec: `../specs/0003-saved-patterns.md`
- `../specs/0001-stripe-pattern-designer.md` defines the panel architecture, the pure transition style, and the drag-and-drop pattern the sidebar reuses.
