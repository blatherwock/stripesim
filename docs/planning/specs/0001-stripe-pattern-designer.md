# Spec: stripe-pattern-designer

Status: rough draft, maintained iteratively alongside the build. Targets tagged [proposed] await confirmation through feedback rounds on the running app.

## Objective

A browser app for designing and experimenting with stripe patterns for crafts, particularly knitting. The user starts from a set of colors and turns controls to try striping patterns, judging which are worth physical swatching. The app renders one live preview; every control change re-renders it immediately.

## Requirements

The app is a single page with a large preview pane and a control panel. The preview pane shows a swatch: a rectangle whose width and height the user sets in the same relative units as stripe thickness (for example a scarf of length 100 and width 10), so the pattern shows its behavior at the real aspect ratio. The swatch always renders fitted into the pane at 85% of the limiting dimension, preserving the unit aspect ratio; there is no scale control, and the fit re-applies when the pane resizes.

Controls:

- Palette: add, remove, and edit colors. Any number of colors.
- Stripe sequence: an ordered, editable list of stripes, each with a chosen color and a whole-number thickness in relative units (a stripe of 2 is twice a stripe of 1). Add, remove, and reorder stripes.
- Repeat mode: how the sequence fills the swatch axis. Cycle repeats the list as-is; ping-pong repeats it alternately forward and reversed.
- Start: a 3x3 grid with the center omitted, one arrow button per edge and corner, each pointing toward the center. The chosen button marks where knitting starts: edges run horizontal or vertical stripes starting flush with that edge (top: top-down, bottom: bottom-up, left: left-to-right, right: right-to-left), corners run diagonal stripes whose phase begins at that corner, and the corner pair picks the slant (top-right/bottom-left one slant, top-left/bottom-right the mirrored slant). Diagonal adds an angle control with preset buttons: 15, 30, 45, 60, 75 degrees from horizontal (default 45), setting steepness only. Custom angles are out of scope: arbitrary angles are not practical to knit. The default start is bottom.
- Swatch size: width and height in whole-number units, edited as one compact `input × input` row.
- Theme: four settings from light to dark — plain off-white light, beige, dark gruvbox browns, and dark grey. All chrome colors (backgrounds, text, borders, selected states, drop indicator) follow the theme. The theme controls anchor to the panel's bottom left corner as a single segmented pill (no heading, one selected segment), always visible while the editing sections scroll above them. The starting theme follows the browser's color-scheme preference (dark-mode browsers start dark, others light, with a light fallback); the toggle overrides it for the session.

Rendering is smooth, hard-edged color bands. No visible grid, no knit texture, no color blending. Stripes clip at the swatch boundary. The app keeps no state between page loads; refresh resets to the default pattern: off-white and blue, simple 1-1 stripes, on a 10 by 100 swatch, cycle repeat, a bottom start.

The model must not preclude a later spec that adds parametric thickness and spacing knobs (ramps, oscillation, easing curves) generating the stripe sequence.

## Decisions

- **Relative units, not knit rows.** Thickness and swatch size are unitless magnitudes; the preview fits the pane at 85% instead of a user-set scale. Rejected knit-row and gauge-based units: v1 is visual exploration, and rows add fidelity complexity the user deferred.
- **Flat stripe list.** Everything is a stripe in one ordered list; a base color is expressed as thick stripes of that color between accent stripes. Rejected a separate base-plus-overlay model as more complex; revisit through feedback if editing base stripes feels awkward.
- **Repetition applies to the sequence.** Cycle and ping-pong repeat the whole stripe list; color ordering such as 1,2,3,2,1 comes from ping-pong. Rejected per-color cycling controls.
- **Diagonals are a rotated field.** Bands draw at an angle over the swatch via canvas rotation. Rejected staircase (cell-stepped) diagonals: knitting-diagonal charts are out of scope for v1.
- **No initial persistence.** Export, saving, URL sharing are all deprioritized for initial implementation.
- **Hard-edged bands only.** Gradients and blending, if ever, are a later spec.
- **Canvas 2D rendering** behind a thin renderer, with pattern logic in pure functions so it is testable without a real canvas.
- **State transitions are pure model functions; the UI dispatches.** `model.ts` exposes `addColor`/`removeColor`/`moveStripe`/`setThickness`-style transitions that each return a new state. `ui.ts` never mutates state: it reads through a `getState` at event time and hands the next state to a `dispatch(next, kind)` callback. `main.ts` owns the state variable, applies the theme side effect at one sync point, and rebuilds the panel on `structure` kinds. Rejected in-place mutation by the UI: it scattered writers, caused stale-swatch and stale-fallback bugs, and left index-capturing closures fragile.
- **Start grid replaces direction plus anchor.** One 3x3 grid with the center omitted, each arrow pointing toward the center, marks where knitting starts: edges pick axis-aligned stripes starting flush with that edge, corners pick diagonal stripes starting at that corner, and the corner pair picks the slant so the angle presets set steepness only. Center-aligned anchoring was removed: the sequence always starts flush at the start edge or corner. Rejected keeping the start/center/end anchor: it does not translate to how knitting proceeds, and corner starts resolve the diagonal anchoring question.
- **Toggle buttons for single-choice controls.** Repeat, angle, and theme presets are single-select groups rendered as one multi-part pill (segments squished together, hairline separators, rounded outer ends); the selected segment is filled dark with `aria-pressed`. Labels live on `aria-label` and tooltip. The angle control offers presets only (15, 30, 45, 60, 75 degrees); arbitrary angles were rejected as impractical to knit.
- **Stripe colors pick from swatch buttons, not a dropdown.** Each stripe row shows one swatch per palette color; native `<select>` popups cannot render color reliably across browsers.
- **Stripes reorder by drag and drop.** A row handle drags with a blue drop indicator showing the insertion point. The whole stripes section is the drop zone — heading, margins, and the area below the last row included — with the target computed from the cursor's height among the row rects, so front and end drops always land. `preventDefault` on every dragover permits the drop; skipping it for self-hovers made browsers cancel edge drops. The indicator is drawn from the drop's target index, not the hovered row: one indicator per gap, on the following row's top edge or the last row's bottom edge for an end drop; a no-op drop shows none. Rejected keeping Up/Down buttons.
- **Icons come from a vendored symbols-only nerd font.** The TTF and its MIT license live in `src/assets/`. Glyph codepoints resolve through the official `glyphnames.json` registry for the matching font version, never from memory: remembered codepoints produced wrong icons once already.
- **The UI font is vendored, not linked.** Quicksand's variable woff2 (weights 300-700, latin subset) and its SIL OFL license live in `src/assets/` beside the nerd symbols font, replacing the Google Fonts `@import`: the app renders offline with no network round-trip or third-party request, and characters outside the latin subset fall back to the sans-serif stack.
- **All numeric controls are whole numbers.** Non-integer input falls back to the last valid value. The pure model still accepts fractional values because the diagonal axis length projects the swatch at fractional lengths internally; the constraint is enforced at the controls.
- **Themes are CSS variables keyed by `data-theme`.** The theme toggle at the bottom of the panel sets a data attribute on the body; the stylesheet derives every chrome color from per-theme variables, so switching themes needs no panel rebuild or canvas redraw. Rejected per-element class swaps: one attribute drives the whole chrome.

## Testing strategy

### Sequence expansion: normal operation

- When the sequence's total thickness is less than the swatch axis length, the system repeats the sequence until the axis is filled, clipping the final repeat at the boundary.
- When repeat mode is ping-pong, alternate repeats run in reverse order without duplicating the boundary stripes.
- The sequence's first stripe always leads at offset 0, which the renderer places flush with the start edge or corner; the tiles then cover the axis from there.
- When the start is a corner, expansion runs along the diagonal axis from that corner with the same flush semantics.

### Sequence expansion: edge cases

- When the stripe sequence is empty, the swatch renders as a single solid color: the first palette color, or white when the palette is empty.
- When the sequence exceeds the axis length, the system clips it, never shrinks it.
- Zero-thickness stripes render nothing.

### Rendering: normal operation

- Each stripe renders as a hard-edged band whose on-screen thickness equals its unit thickness multiplied by the fit scale.
- Edge starts render horizontal or vertical bands flush with that edge (a bottom or right start mirrors the axis). Corner starts render diagonal bands in a rotated frame anchored at that corner, slant from the corner pair, steepness from the angle control.
- The swatch renders at 85% of the preview pane, fitted along the limiting dimension with the unit aspect ratio preserved.

### Rendering: edge cases

- Bands clip at the swatch boundaries and never bleed outside it.
- Pane size changes alter only on-screen size, never the pattern.

### Controls: normal operation

- Palette edits, stripe edits, repeat mode, start, angle, and swatch size each re-render the preview immediately on change.
- The start grid renders eight arrow buttons, one per edge and corner with the center omitted, and the active start selected; picking an edge or corner updates state immediately, and a pick that crosses between them restructures the panel.
- The angle buttons (15, 30, 45, 60, 75) appear only when the start is a corner; 45 is selected by default.
- Removing a palette color removes the stripes that reference it.
- The theme group renders four toggles with the active theme selected; switching updates state and the body's theme attribute immediately.

### Controls: failure handling

- Invalid numeric input (empty, negative, non-integer, non-numeric) in thickness or swatch size falls back to the last valid value rather than breaking the preview. All numeric controls accept whole numbers only.

## Open questions

- Undo within the stripe editor.
- The later parametric-knobs spec: rule types, easing curves, and how generated sequences expand into the editable list.

## Related documents

- `../plans/0001-initial-build.md`
