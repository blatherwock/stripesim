# stripe-planner

A browser-based TypeScript app. Vite serves and bundles it, vitest runs the tests, biome lints and formats, and the project image carries the full toolchain.

## Commands

Everything runs through the root `justfile`, on the host through the project image and inside the container directly:

- `just build`: refresh `package-lock.json` and build the project image (host only)
- `just pi`: start a pi session in the project container (host only)
- `just shell`: drop into a bash prompt in the project container (host only)
- `just dev`: serve the vite dev server on `http://127.0.0.1:5173` (host only)
- `just test`: run the vitest suites
- `just fix`: apply biome formatting and safe fixes
- `just check`: read-only gate (lint, typecheck)
- `just hooks`: install the git hooks; `just clean`: remove the image
