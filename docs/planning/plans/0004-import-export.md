# Implementation plan: saved pattern import and export

Lightweight plan. Implements an addition to `../specs/0003-saved-patterns.md`; the confirmed decisions below extend that spec's behavior. Also changes one `0003` behavior per user direction: new saves append to the end of the list instead of prepending (spec updated in place).

## Overview

Two buttons at the bottom of the expanded sidebar: export downloads the saved list as a JSON file; import opens a file picker, then a modal with Replace, Add, and Cancel. Replace swaps the list wholesale; add puts the file's patterns after the existing cards. A file that fails to parse or contains an invalid entry shows an error message in the modal instead of the three buttons; retry happens by picking a file again. Escape and a backdrop click dismiss the modal as cancel. New saves append to the end of the list, matching import's add. (The modal buttons were renamed from Overwrite and Append to Replace and Add after the initial implementation. The file format was later revised by `0006-share-link.md`: the `{ version: 1, patterns: [...] }` wrapper was retired in favor of a bare JSON array whose entries are the share codec's encoded pattern strings. With it, one exception entered the all-or-nothing rule: entries that decode but drop stripes for unknown colors load, with a warning above the three buttons.)

Confirmed decisions:

- Export wraps the patterns in a versioned object (rejected: bare array, which would leave no marker for future format changes). Revised by the share-codec export: the wrapper was retired in favor of a bare array whose entries each carry a version byte.
- An invalid import file is rejected whole with an error in the modal (rejected: dropping invalid entries individually, which imports less than the user expects; rejected: silently changing nothing). Revised by the share-codec export: entries that decode but drop unknown-color stripes load with a warning; every other reason stays all-or-nothing.
- Imported items land after existing cards; new saves do too.
- The modal dismisses via Escape and backdrop click in addition to the cancel button.
- **The export file carries bare pattern parameters, not entry ids, and imports mint fresh ids for every entry.** Revised after the initial implementation surfaced an append collision: appending the same file twice duplicated the imported ids, so overwrite-by-id and delete-by-id hit both copies. Identity belongs to the list slot; exported ids were dead weight that could only collide, so they left the file format and `toSaved` mints ids on entry. [confirmed]

## Task list

- [x] Task 1: file format and save position in `src/saved.ts`
  - `serializeSaved(list)` producing the export file's JSON text (initially `{ version: 1, patterns }`; revised to a bare array of share-encoded values by `0006-share-link.md`); `parseImportFile(text)` returning the decoded patterns plus a count of dropped unknown-color stripes, or a failure result when the text is unreadable, wrong-shaped, a foreign version, or contains any invalid entry (all-or-nothing outside the dropped-stripe case, unlike storage's per-item dropping). `createSaved` appends instead of prepends.
  - Update `src/saved.test.ts`: append position, file round-trip, and rejection of unreadable, wrong-shaped, foreign-version, and partially invalid files.
- [x] Task 2: footer, export, and import modal in `src/sidebar.ts`
  - A footer row under the scrolling list with text-labeled Export and Import buttons. Export builds the download from `serializeSaved` through a blob URL and a throwaway anchor named `stripe-planner-patterns.json`. Import triggers a hidden file input, reads the file, parses it, and renders the modal into the sidebar host: three buttons on a valid file, an error message plus cancel on an invalid one. Escape, backdrop click, and cancel remove the modal; overwrite and append dispatch a new `import` change carrying the mode and items.
  - Update `src/sidebar.test.ts`: export produces the file name, URL, and JSON payload; the modal renders and dispatches overwrite and append; cancel, Escape, and backdrop dismiss; an invalid file shows the error state.
- [x] Task 3: wiring and styles
  - `src/main.ts` handles the `import` change through `applySavedWrite` (overwrite replaces, append concatenates; failed writes keep the existing disabled-save behavior). `src/style.css` styles the footer, the hidden input, and the modal backdrop and dialog using existing theme variables.
  - Update `src/main.test.ts`: an append through the mounted sidebar lands after existing cards.

### Checkpoint: app green

- [x] `just fix`, `just check`, and `just test` pass (124 tests).

## Related documents

- `../specs/0003-saved-patterns.md` (revised: new saves append to the end)
