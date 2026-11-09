# Implementation plan: initial build of the stripe pattern designer

Status: complete. The initial build and all first feedback rounds landed; further change is feedback-driven and tracked in the spec, not as tasks here. Implements `../specs/0001-stripe-pattern-designer.md`.

## Overview

Build the v1 app: a pure pattern model (palette, stripe sequence, repeat mode, direction, anchor, swatch size), a thin canvas renderer, and a control panel wired for live re-rendering. No runtime dependencies; canvas 2D plus DOM controls only.

## Task list

### Phase 1: pattern model

- [x] Task 1: define the state types in `src/model.ts`
  - Types for colors, stripes, repeat mode, direction, anchor, and pattern state, plus a default demo state (two colors: off-white and blue, simple 1-1 stripes).
  - Satisfies spec scenarios: sequence expansion (normal, edge cases)
- [x] Task 2: implement sequence expansion as pure functions with tests
  - `expand` turns a stripe sequence plus repeat mode, anchor, and axis length into positioned segments, clipped to the axis. Cycle and ping-pong repeats, all three anchors, empty sequence, overlong sequence, zero thicknesses. The pure function also covers fractional values, which the controls no longer produce but the anchor math does.
  - Satisfies spec scenarios: sequence expansion (normal, edge cases)
- [x] Task 3: implement axis length from direction and swatch size
  - The diagonal axis length covering the rotated swatch, with tests.
  - Satisfies spec scenarios: sequence expansion, diagonal (normal)

### Checkpoint: model green

- [x] `just fix`, `just check`, and `just test` all pass; the scaffold `main.test.ts` is replaced by model tests.

### Phase 2: renderer

- [x] Task 4: implement `src/render.ts`
  - Draw the swatch: clear, clip to the swatch rectangle, draw expanded segments as hard-edged bands, horizontal and vertical directly, diagonal via canvas rotation. Thin layer; happy-dom lacks a real canvas, so unit tests drive it through a fake 2D context that records fills.
  - Satisfies spec scenarios: rendering (normal, edge cases)

### Checkpoint: renders without type errors

- [x] `just check` passes; `src/render.test.ts` drives the renderer through a fake 2D context, covering all three directions plus fallbacks.

### Phase 3: controls and wiring

- [x] Task 5: build the control panel in `src/ui.ts`
  - Palette editor, stripe list editor (add, remove, reorder, color, thickness), repeat mode, direction and angle, anchor, swatch size, scale slider. Invalid numeric input falls back to the last valid value.
  - Satisfies spec scenarios: controls (normal operation, failure handling)
- [x] Task 6: wire state to live re-render and mount the app
  - Replace the scaffold `main.ts` with the app mount: pane plus panel, swatch scrolling, immediate re-render on every control change.
  - Satisfies spec scenarios: controls (normal operation)

### Checkpoint: app reviewable

- [x] `just fix`, `just check`, `just test` pass; the user runs `just dev` and gives the first feedback round.

### Phase 4: pure-state refactor (feedback rounds)

- [x] Task 7: move all state transitions into pure functions in `src/model.ts`
  - `patchControls`, `setSwatchSize`, `addColor`, `setColorHex`, `removeColor` (drops referencing stripes), `addStripe`, `removeStripe`, `setStripeColor`, `setStripeThickness`, `moveStripe` — each returns a new state, never mutates. Model tests cover the non-trivial semantics plus a no-mutation guard.
- [x] Task 8: rewrite `src/ui.ts` as a dispatcher
  - `buildPanel(host, getState, dispatch)`: handlers read state fresh at event time (no stale closures), derive next state with model transitions, and hand it to `dispatch` tagged `canvas`/`structure`. `numberInput` falls back through a `current()` getter instead of hidden mutable local state.
- [x] Task 9: `src/main.ts` owns the state
  - `mount` re-assigns from dispatches, applies the theme side effect at one sync point (`document.body.dataset.theme`), and returns a `dispose` that removes the resize listener.

### Checkpoint: refactor green

- [x] `just fix`, `just check`, `just test` pass (74 tests); behavior unchanged, verified by the existing suite plus new model transition tests.

## Risks and mitigations

| Risk                                                                        | Impact | Mitigation                                                                              |
| --------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| happy-dom has no real canvas; renderer cannot be unit tested                | Med    | Keep all logic in the pure model; renderer stays a thin drawing layer verified visually |
| Diagonal anchor semantics are fuzzy in the spec                             | Med    | Ship the simplest consistent behavior, flag it in the first feedback round              |
| Stripe editor UX (flat list) may feel awkward for base-plus-accent patterns | Med    | Feedback rounds decide whether to add convenience affordances or a base model           |

## Open questions

- Fit-to-pane: resolved during feedback; the swatch always renders at 85% of the pane's limiting dimension with no scale control.

## Related documents

- `../specs/0001-stripe-pattern-designer.md`
