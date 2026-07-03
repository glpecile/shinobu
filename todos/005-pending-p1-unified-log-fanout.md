---
status: pending
priority: P1
---

# Unified Log Fan-Out (`useLogMedia`)

This is the actual purpose of the app (`plan.md` 1.3): logging a piece of media once
should write it to every connected provider it applies to, not just one.

## Acceptance Criteria

- `useLogMedia` mutation (naming per `AGENTS.md` Query Hook Conventions) accepts a
  `NormalizedMediaItem` + log intent (watched / read) and fans out in parallel to
  every *connected* provider *applicable* to that item's type.
- Routing table (`lib/providers/routing.ts`) is explicit and unit-testable: Movie →
  Trakt + Letterboxd; TV → Trakt; Manga → AniList; Anime film → AniList + Trakt +
  Letterboxd (the edge case called out in `plan.md` 1.3 — don't assume a 1:1
  type-to-provider mapping).
- Partial failure is surfaced per-provider (e.g. `{trakt: 'ok', letterboxd: 'error'}`),
  never collapsed into one boolean/throw — the UI needs to tell the user which
  provider(s) didn't get the write.
- `MediaCard`'s `onLogMedia` prop (see `plan.md` 3.2) calls this mutation.

## Dependencies

Needs at least two connected/write-capable providers to be meaningful — build after
`todos/001` (Trakt) and `todos/002` (AniList) land; extend to Letterboxd once
`todos/004` is unblocked.
