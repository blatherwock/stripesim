# Spec: working-state

## Objective

Keep the unsaved working pattern across page reloads, and add a Reset button to the control panel that restores the default pattern. Supersedes the clause in `0001-stripe-pattern-designer.md` that a refresh resets the app to the default pattern; everything else in that spec stands.

## Requirements

The working pattern (the editor state's pattern parameters: palette, stripes, repeat, origin, angle, swatch size) persists in the page URL, not in storage: the query parameter `?p=` holds the pattern encoded by the share codec, rewritten through `history.replaceState` on every state change, so a refresh, a bookmark, or a copied link restores it. On load, the app reads the query, then a share fragment (`#p=`, read-only input), and falls back to the default demo pattern when neither decodes. The theme, the saved list, and the sidebar's collapsed state keep their own `localStorage` keys and are unaffected.

Revised after the initial implementation: the working pattern first persisted under its own `localStorage` key, then moved to the URL query (`../plans/0006-share-link.md`); the `stripe-planner.working` key no longer exists.

The control panel gains a Reset button at its top, above the editing sections. Pressing it replaces the working pattern with the default demo pattern (fresh palette ids, default stripes, origin, angle, swatch) and rebuilds the panel; the theme and the saved list are untouched. The reset persists like any other state change: a refresh after a reset shows the default pattern.

## Decisions

**The working set stores pattern parameters only, not the theme.** The theme already persists under its own key, confirmed as independent; the working set reuses that split so one key per concern.

**Reset keeps the theme and the saved list.** Reset is a pattern operation; the theme is a page preference and the saved list is the user's archive. Resetting those would be a surprising side effect.

**An undecodable working value falls back to the default pattern.** The value is one encoded object, so there is nothing to salvage partially: an undecodable query falls through the fragment, then the default.

**The URL mechanism has no write-failure path.** Under the earlier storage design, write failures were silent; `history.replaceState` has no quota to exceed, so the case no longer exists.

## Testing strategy

### Persistence: normal operation

- When the user changes a control and reloads, the app shows the changed pattern.
- When the user restores a saved card and reloads, the working set shows the restored pattern.
- When the user resets and reloads, the app shows the default pattern.

### Persistence: failure handling and edge cases

- When the query is absent or undecodable, the app loads the share fragment if one decodes, otherwise the default pattern.
- When the query names one pattern and the fragment another, the query wins.
- When the URL is cleared, the theme, saved list, and collapsed state are unaffected, and vice versa.

### Reset: normal operation

- When the user presses Reset, the panel and preview show the default pattern, rebuilt for the default rows.
- When the user presses Reset while a non-default theme is active, the theme stays.
- When the user presses Reset, the saved list is unchanged.

### Working pattern (IPO)

- Inputs: the page URL's query string, or none.
- Process: read `?p=`, decode with the share codec, validate.
- Outputs: the working pattern's parameters, or null when no valid value is present.
- Failure outputs: null for an absent or undecodable query, letting the caller try the fragment, then the default.

## Open questions

None.

## Related documents

- `0001-stripe-pattern-designer.md` (refresh clause superseded by this spec)
- `0003-saved-patterns.md` defines the per-key persistence split this spec follows.
- `../plans/0006-share-link.md` owns the codec and the URL-query mechanism that replaced the storage key.
