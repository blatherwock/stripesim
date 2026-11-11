# Implementation plan: share link

Lightweight plan. Adds a share link: the working pattern encoded as short URL-compliant text in the URL fragment, a Share button that copies the link, and on-load handling of a shared hash.

## Overview

New module `src/share.ts` encodes `PatternParams` into a byte stream and base64url-encodes it. The format: version byte, repeat, origin index, angle (degrees/15), LEB128 varints for swatch size, palette length, 3 RGB bytes per color, stripes length, then per stripe a color-index and thickness varint. Colors are referenced by palette position, never by id, mirroring the export file's id-free content. Base64url uses only `A-Za-z0-9-_`, so the value is URL compliant without percent-encoding; it lives in the URL fragment (`#p=...`), which never reaches a server.

Decode validates and rejects: wrong version, truncation, or an unknown color index drops that stripe (content is id-free by design; identity is position).

Confirmed format decisions:
- Palette colors ride as raw RGB triples; ids never leave the app (consistent with the export file).
- The value sits in the hash fragment, not the query, so sharing never involves the server.
- A shared hash beats the stored working set on load; the decoded pattern then persists as the working set through normal edits.

## Task list

- [x] Task 1: codec in `src/share.ts`
  - `encodePattern(params)` and `decodePattern(text)` per the format above; `ORIGINS` order exported from `src/model.ts` and shared with the saved-list validator.
  - Tests: round-trip all fields; alphabet compliance; idempotence; rejection of wrong version, truncation, non-base64; stripe with out-of-range color index dropped; empty palette; large varints.
- [x] Task 2: share button and hash handling
  - A Share button (arrow leaving a box icon is taken; share uses `fa-share`/`fa-up-right-from-square`, whichever the registry offers) in the sidebar footer; clicking copies the full URL with the encoded hash to the clipboard. On load, a decodable hash seeds the state, beating the stored working set. (Superseded by the query revision below: the copied URL carries the query, no stored working set exists, and the app never writes the fragment; a `#p=` hash stays read-only input for older links.)
  - Tests: clipboard receives the URL with the hash; a mounted app loads the shared pattern; hash beats storage.

### Checkpoint: app green

- [x] `just fix`, `just check`, and `just test` pass (142 tests).

## Revision: export via the share codec (confirmed)

The export file format adopts the share codec: each pattern exports as its encoded value, wrapped in a JSON array to keep the file inspectable; the `{ version: 1, patterns }` wrapper is retired, since each encoded value already carries a version byte. One code path for share and export outweighed a fully human-readable file; debuggability and support are non-goals for this helper app. With that settled, the decoder gains structured error reporting — no format change, no version bump: reasons are computed from the same bytes.

- `decodePattern` returns a `ShareResult` union: `{ ok: true, params, dropped }` or `{ ok: false, reason, detail? }`, with reasons `malformed`, `version`, and `structure` (detail: byte offset).
- Unknown-color stripes are recoverable: an `ok` result counts them in `dropped`, and the import modal reports the count in a warning above the Replace, Add, and Cancel buttons, loading the rest. Every other reason stays all-or-nothing.
- The hash path treats non-ok results as no fragment, so the app falls back to the default pattern, same as any null.

## Revision: the URL query is the current state (confirmed)

Revised after the working-set storage landed: the working pattern no longer persists in `localStorage`. The query parameter (`?p=`, the same encoded value as the share fragment) is the current state holder. Every edit rewrites it through `history.replaceState`, which updates the address without adding a browser history item. On load the precedence is query, then share fragment, then the default demo pattern; an undecodable query falls through the fragment to the default. The Share button copies `location.href`, which now carries the query, so it needs no hash of its own. The `stripe-planner.working` key is gone; theme, saved list, and collapse keep their own keys.

## Revision: session history with back and forward (confirmed)

A session history list replaces the single-state URL: every pattern change (panel edits, restore, reset) pushes the new encoded state and rewrites the query through `history.replaceState`. The list holds all states including the current one, capped at 50, dropping oldest first; identical consecutive states are skipped. Back and forward buttons in the panel header move the cursor; the buttons disable at the oldest and newest ends. Editing while back prunes everything after the cursor. History is session-only: a reload starts with a single state from the query, fragment, or default.

## Related documents

- `../specs/0003-saved-patterns.md` and `../specs/0005-working-state.md` own the persistence split the share link respects (hash is read-only input; it does not write storage directly).
