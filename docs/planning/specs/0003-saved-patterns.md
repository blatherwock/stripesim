# Spec: saved-patterns

## Objective

Let users capture the current pattern parameters as a card in a right-hand sidebar, restore any card with one click, and manage the list. Cards persist across page reloads through `localStorage`, as does the active theme, which persists automatically under its own key.

## Requirements

The sidebar is a third column on the right edge of the app, after the preview pane. It is 150 px wide, narrower than the control panel. It contains, from top to bottom:

- A header row with a collapse toggle and a save button.
- A scrolling list of saved cards. Each card shows a small rendered thumbnail of the saved pattern. Cards carry no text label.
- A pair of buttons pinned to the card's right side, visible only while the pointer hovers the card: a save button (floppy disk icon) on top, and a delete button (trash can icon) below it.

Pressing the header save button captures the current pattern parameters (palette, stripes, repeat, origin, angle, swatch size), not the theme, and appends a new card to the end of the list; the cards above keep their positions. Pressing a card's save button replaces that card's stored parameters with the current editor parameters, updating its thumbnail and leaving the card where it sits in the list. Clicking a card replaces the current pattern parameters with the saved ones, leaving the theme untouched. Dragging a card onto another position in the list reorders it, with a drop indicator matching the stripe rows. Clicking a card's delete button removes that card.

The collapse toggle collapses the column to a slim rail holding only an expand button, letting the preview pane reclaim the width. The collapsed state persists across reloads under its own `localStorage` key; a missing or invalid stored value starts the sidebar expanded. [confirmed]

The saved list is the persisted source of truth: every save, restore, delete, and reorder goes through the storage layer, and the sidebar re-reads the list after each change. On reload the list, including drag order, is restored from `localStorage`.

The active theme persists automatically and independently of the saved list, under its own `localStorage` key. Changing the theme writes it immediately; no explicit save is involved. On load, the app reads the stored theme before the first render, falling back to the browser's preferred color scheme when no valid value is stored. [confirmed] Clearing or corrupting either key leaves the other unaffected.

## Decisions

**Saved items capture pattern parameters only, not the theme.** [confirmed] The rejected alternative, saving the full state, would make restoring a card also switch the page theme.

**Cards carry a thumbnail only, no text label.** [confirmed] Rejected alternatives: an automatic timestamp label; an editable name.

**The sidebar is collapsible.** [confirmed] The rejected alternative is an always-visible fixed column.

**Card save overwrites the slot in place; the header save button creates a new record.** [confirmed]

**The theme persists automatically under its own storage key, separate from the saved list.** [confirmed]

**The sidebar's collapsed state persists across reloads.** [confirmed] It is stored under its own `localStorage` key, independent of the saved list and the theme.

**The storage layer owns list order as a plain array.** [proposed] The sidebar re-reads the full list after every change, so reordering is one array move and one write; per-item sort keys would add state without benefit at this scale.

**Invalid persisted items are dropped individually; the valid items load.** [confirmed] A stored value that fails to parse as JSON at all yields an empty list.

**Storage write failures disable the save buttons and apply no change.** [confirmed] When writing fails (quota exceeded, storage unavailable), the header save button and every card save button disable, and the change is not applied to the in-memory list. The alternative, updating the in-memory list anyway, splits what the UI shows from what survives reload.

## Testing strategy

### Saving: normal operation

- When the user presses the header save button with a pattern configured, a card appears at the end of the list whose thumbnail matches the preview, and the cards above keep their positions.
- When the user saves twice in a row without changes, two cards appear, identical thumbnails, newest last.
- When the palette or stripes change between saves, the two cards show different thumbnails.

### Saving: failure handling

- When `localStorage` write throws (quota exceeded), no card is added and the save buttons show disabled.
- When `localStorage` is unavailable entirely, the list starts empty and the save buttons show disabled.

### Overwriting a card: normal operation

- When the user changes the editor parameters and presses a card's save button, that card's thumbnail changes to match the preview and its position in the list is unchanged.
- When the user overwrites a card, the other cards and the list order are unchanged.

### Overwriting a card: edge cases

- Overwriting a card with unchanged parameters leaves the list as it was.
- Overwriting a card whose pattern used an edge start, while the editor shows a corner start, replaces the slot wholesale so conditional rows follow the new pattern on restore.

### Card buttons: normal operation

- When the pointer hovers a card, both buttons appear on the card's right side with the save button above the delete button; when the pointer leaves, both hide.

### Restoring: normal operation

- When the user clicks a card, the preview and control panel show the saved pattern's parameters.
- When the user restores a card while a non-default theme is active, the theme stays unchanged.

### Restoring: edge cases

- Restoring a card leaves the card in the list.
- A card saved from an edge-start pattern restores with the panel rebuilt for edges (and likewise for corners), so conditional rows match.

### Deleting: normal operation

- When the user clicks a card's delete button, the card disappears from the list and the delete survives reload.
- When the user deletes one card, the other cards and the list order are unchanged.

### Reordering: normal operation

- When the user drags a card and hovers over list positions, an insertion indicator tracks the cursor, as with the stripe rows.
- When the user drops a card on a new position, the list shows the new order and the order survives reload.
- When the user drops a card where it was picked up, the order is unchanged.

### Persistence: normal operation

- When the page reloads after saves, overwrites, deletes, and reorders, the list reappears with the same cards in the same order and matching thumbnails.

### Persistence: failure handling and edge cases

- When the stored value fails to parse as JSON, the list starts empty.
- When the stored value parses but an item fails validation (wrong fields, wrong types, unknown fields), that item is dropped and the remaining items load. This covers data written under a different schema.
- When two tabs of the app are open, last write wins on reload; live cross-tab sync is out of scope.

### Theme persistence: normal operation

- When the user picks a theme and reloads, the page starts in that theme.
- When the user changes the theme, the stored value updates immediately, with no save gesture.

### Theme persistence: failure handling and edge cases

- When the stored theme value is not one of the four theme names, the app falls back to the browser's preferred color scheme.
- When theme storage is unavailable or its write fails, the theme still applies for the session and the save button's failure state is unaffected; no error surfaces.
- When the saved-list storage is cleared or corrupted, the stored theme is untouched, and vice versa.

### Collapsing: normal operation

- When the user presses the collapse toggle, the column collapses to a rail holding an expand button and the preview pane widens.
- When the user presses the expand button, the sidebar returns with its full contents.
- When the page reloads, the sidebar starts in the persisted state, expanded or collapsed.
- When the stored collapsed-state value is missing or invalid, the sidebar starts expanded.

### Saved-pattern storage (IPO)

- Inputs: a list of saved patterns, or none (empty storage); a create request carrying the current pattern parameters; an overwrite request carrying an item id and replacement parameters; a delete or reorder request carrying an item id or indices.
- Process: validate, transform to and from the persisted JSON shape, delegate list transitions to pure model functions.
- Outputs: the current validated list; the updated list after each mutation; a success or failure flag for writes.
- Failure outputs: an empty list for storage that fails to parse as JSON; a list of the valid items when some items fail validation; a failure flag (no mutation) for failed writes.

## Open questions

None.

## Related documents

- `docs/planning/specs/0001-stripe-pattern-designer.md` defines `PatternState`, the pure transition style, and the panel architecture this spec extends.
- `docs/planning/plans/0004-import-export.md` extends this spec with the import and export behavior: the file format, the import modal, and new saves appending to the end.
