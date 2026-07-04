---
status: done
date: 2026-07-04
---

# 0005 — Provider Capability Model, Notification Policy, Web-CORS Policy

## Context

A deep-dive on three vision additions (future domains like games/books/music, the
"connect → Up Next → notifications" onboarding end-state, and making "never a
backend" an explicit policy) surfaced that future providers will routinely be
read-only, write-only, or CSV-only — Goodreads' API is dead, RYM has none, Steam is
read-only. Raw reasoning in
`docs/brainstorms/2026-07-04-future-domains-and-no-backend.md`.

## Decisions

- **Providers declare capabilities.** `src/lib/providers/registry.ts` is the single
  registry: each provider declares `mediaTypes`, `canRead` (feeds `useUnifiedFeed`),
  and `canWrite` (target for `useLogMedia`). Routing (`src/lib/providers/routing.ts`,
  unit-tested) filters connected + applicable + capable. No symmetric read+write
  assumption, no per-provider `if`s outside the registry.
- **Extension points are the `MediaType`/`ProviderId` unions + registry only.** No
  fourth provider named in docs; the abstraction gets validated when one is chosen.
- **`NormalizedMediaItem` changes** (`src/types/media.ts` is now the source of truth,
  `plan.md` 2.2 mirrors it): added `progressUnit` (progress is unit-ambiguous across
  future domains) and `isFilm` (anime films route as MOVIE to Trakt/Letterboxd
  without a fifth `MediaType`).
- **Notifications: local-only v1, door open** (resolves `todos/007`'s open question).
  Air dates are known in advance, so schedule local notifications on app foreground
  for the next ~7–14 days — no push server. Web gets in-app Up Next only. The only
  permissible future server exception is a tiny *stateless* push relay, and only if
  staleness hurts in practice.
- **Web CORS policy: a provider that blocks browser origins is native-only on web**
  ("connect on mobile") — never proxied. Verified per provider by spike
  (`todos/008`) before building that provider's web read path.
- **OAuth without a backend**: client credentials (e.g. Trakt `client_secret`) ship
  in the bundle, standard for installed apps; AniList uses client-side implicit
  grant (~1yr tokens). Accepted for this threat model.

## Consequence

`todos/001`/`002`/`005` now build against real contracts
(`src/types/media.ts`, `src/lib/providers/*`) instead of doc snippets. New todos:
`008` (web CORS spike, ready) and `009` (onboarding connect flow, pending).
`todos/007` updated with the delivery decision. Added `@types/bun` +
`"types": ["bun"]` in `tsconfig.json` (TypeScript 6 doesn't auto-include
`node_modules/@types`) and `bun test` / `typecheck` scripts.

## Verification

`bunx tsc --noEmit` clean; `bun test` passes 10 routing cases including the
anime-film × partial-connection matrix.
