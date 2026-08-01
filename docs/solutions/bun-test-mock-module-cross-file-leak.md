# `mock.module` on a shared module leaks across test files — `--isolate` is required

## Symptom

`src/state/queries/mapping.test.ts` (plan 0034 U7) passes every test in
isolation (`bun test src/state/queries/mapping.test.ts`) but fails several
of them — `cachedTraktLookup`, `cachedTraktTextSearch`, `cachedSeasonLayout`,
`mappingQueryKeys` — when the full suite runs (`bun test`). The failing
assertions see the *fake* return values (`null`/`undefined`) that other,
unrelated test files configured, not the real implementation.

## Root cause

Several existing suites (`features/log-media/enrich.test.ts`,
`remove-watched-from-watchlist.test.ts`, `use-log-media.test.ts`,
`features/watchlist-media/use-watchlist-media.test.ts`,
`use-unwatchlist-media.test.ts`) call
`mock.module('@/state/queries/mapping', () => ({ ...fakes }))` to fake the
whole module — a long-standing, working pattern *until* a second file needs
the **real** `mapping.ts` in the same process.

`mock.module` mutates a process-wide registry keyed by the module's resolved
file, not by which specifier (`@/state/queries/mapping` vs the relative
`./mapping` `mapping.test.ts` itself uses) requested it. Once any file
registers a mock for that resolved file, every other file's import of it —
alias or relative — resolves to the mock for the rest of the `bun test`
process, in this bun version (1.3.13). `mock.restore()` does **not**
reliably undo this (tried at both the mocking file's `afterAll` and the
consuming file's very first line — neither restored the real module).

The same failure mode hit `state/queries/use-unified-feed.test.ts` for the
identical reason once it needed `lib/providers/simkl/reads.ts` for real
while `lib/providers/simkl/reads.test.ts` exists.

## Fix

- **`bun`'s own answer is `--isolate`** ("Run each test file in a fresh
  global object"): confirmed by direct repro
  (`bun test --isolate features/log-media/enrich.test.ts
  state/queries/mapping.test.ts` → 17/17 pass; without the flag → 8 fail).
  `package.json`'s `test` script now runs `bun test --isolate`, so `bun run
  test` / `bun test` (via the script) is green. **Bare `bun test` invoked
  directly (bypassing the npm script) does not pick this up** — bun has no
  `bunfig.toml` key or env var for it in this version (both tried and
  confirmed inert). Anyone running the raw CLI needs `bun test --isolate`
  explicitly; CI and `bun run test` are already covered.
- **Prefer HTTP-boundary fakes over `mock.module`-replacing a shared read
  module** wherever a dedicated `reads.test.ts` already exists for that
  provider (see `state/queries/mapping.test.ts` and
  `state/queries/use-unified-feed.test.ts`, both rewritten this way): fake
  `@/lib/http/client`'s `httpFetch` with a URL-substring router (the
  `lib/providers/*/reads.test.ts` / `lib/providers/media-details.test.ts`
  pattern) and call the *real* provider functions. This never touches the
  module registry, so it can't leak into — or be leaked into by — another
  file regardless of `--isolate`.
- Whenever a new module gains an import edge into `state/queries/simkl.ts`
  (directly or transitively, e.g. `mapping.ts`/`watchlist.ts`/
  `use-unified-feed.ts` importing `./simkl` for plan 0034), every existing
  test file that imports the *changed* module unmocked now also needs the
  `expo-crypto` stub (`state/queries/simkl.test.ts`'s pattern) — that part
  is a genuine new transitive dependency per file, not a cross-file leak,
  and `--isolate` does not exempt a file from needing a mock its own import
  graph now requires.

## Rule of thumb

A new test file that needs the *real* implementation of a module some other
suite already fakes wholesale via `mock.module` will not reliably coexist
with it in one `bun test` process without `--isolate`. Either keep the new
suite HTTP-boundary-driven (no `mock.module` on the contested module) or
confirm `--isolate` is in the actual command the gate runs.
