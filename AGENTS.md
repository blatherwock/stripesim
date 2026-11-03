# Agent instructions

Run the task runner recipes for all verification; do not call the underlying tools directly.

- `just fix` after changes, then `just check` before declaring work done.
- `just test` runs the test suites.

## Project conventions

- Browser TypeScript app with no runtime dependencies: vite serves and bundles from `index.html` and `src/`, with `src/main.ts` as the entry module.
- Vitest runs tests colocated with their modules as `src/*.test.ts` under the happy-dom environment.
- Add dependencies only after confirmation; keep the dev dependency set minimal.
