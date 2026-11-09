# Implementation plan: collapse direction and anchor into a start grid

Status: complete. All tasks landed and verified with `just fix`, `just check`, and `just test`.

## Overview

Replaces the separate Direction and Anchor controls with one 8-button start grid: a 3x3 grid with the center omitted, each button an arrow pointing toward the center, representing where knitting starts. Edge buttons are horizontal or vertical stripes starting flush with that edge (top: horizontal top-down, bottom: horizontal bottom-up, left: vertical left-to-right, right: vertical right-to-left). Corner buttons are diagonal stripes whose phase starts at that corner; the corner pair encodes slant (top-right/bottom-left one slant, top-left/bottom-right the mirrored slant) and the angle presets control steepness. The default start is bottom (horizontal stripes going bottom to top). Center-aligned anchoring is removed. Updates the controls, decisions, and scenarios in `../specs/0001-stripe-pattern-designer.md`, which tracked corner anchoring as an open question.

## Task list

### Phase 1: pattern model

- [x] Task 1: replace `direction` and `anchor` in `src/model.ts` with an `origin` field
  - New `Origin` union (top, right, bottom, left, and the four corners) on `PatternState`; `directionOf(origin)` derives horizontal, vertical, or diagonal; `ControlPatch` patches `origin` instead of `direction` plus `anchor`. Default state uses `origin: "bottom"`. `expand` drops its anchor parameter: the first stripe always leads at offset 0, and the removed `phase` helper goes with it.
  - Satisfies spec scenarios: sequence expansion (normal, edge cases)
- [x] Task 2: update `src/model.test.ts`
  - Drop the end/center anchor tests, keep first-stripe-at-0 coverage under the new `expand` signature, and cover `patchControls` with `origin`.
  - Satisfies spec scenarios: sequence expansion (normal, edge cases)

### Phase 2: renderer

- [x] Task 3: make `src/render.ts` origin-aware and update `src/render.test.ts`
  - Derive direction from `origin`. Edges: bottom and right starts mirror the axis so the first stripe hugs that edge. Corners: rotated frame anchored at the chosen corner, axis pointing into the swatch, slant per corner pair, angle presets setting steepness only. Tests cover both edge mirrors and at least one corner per slant.
  - Satisfies spec scenarios: rendering (normal, edge cases)

### Phase 3: controls and docs

- [x] Task 4: build the start grid in `src/ui.ts` and style it in `src/style.css`
  - One field row labeled Start: 3x3 grid, center cell an inert spacer, eight buttons with registry-resolved nerd font arrows pointing toward the center (fa-arrow glyphs for edges, md-arrow glyphs for corners). Clicking dispatches `patchControls` with `origin`; the change kind is `structure` when diagonal-ness flips, else `canvas`. The angle row appears when `directionOf(origin)` is diagonal. Update `src/ui.test.ts` for the grid, selection, and the angle reveal.
  - Satisfies spec scenarios: controls (normal operation)
- [x] Task 5: update `../specs/0001-stripe-pattern-designer.md`
  - Controls section, decisions, and scenarios describe the start grid; the corner-anchoring open question is resolved and removed.

### Checkpoint: definition of done

- [x] `just fix`, `just check`, and `just test` pass.

## Risks and mitigations

| Risk                                                                   | Impact | Mitigation                                                                                                                                                                   |
| ---------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diagonal rotation math differs per corner, inviting mirrored-axis bugs | Med    | Derive each corner's rotation from the axis vector (top-left and bottom-right differ from top-right and bottom-left); test one corner per slant against hand-computed frames |
| Vendored symbols font lacks suitable arrows                            | Low    | Confirmed against the official glyphnames.json registry: four fa-arrow and four md-arrow glyphs cover all eight buttons                                                      |

## Open questions

- None; the corner semantics, slant pairing, and edge alignment were confirmed with the user before this plan.

## Related documents

- `../specs/0001-stripe-pattern-designer.md`
- `../plans/0001-initial-build.md`
