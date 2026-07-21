---
status: done
priority: P2
---

> **Done (PR #4):** OAuth (web + native), `useWatchedShowsQuery` into the unified
> feed, and the Trakt write adapter (`lib/providers/trakt/`) registered in the
> routing table. `registry.ts` is `canRead`/`canWrite: true`. Filename was stale
> (`ready`); renamed to match the `done` frontmatter.

# Trakt Integration

Wire up Trakt as a connected provider (`state/session/`): OAuth, the read side
(`GET /sync/watched/shows` into `useUnifiedFeed`), and a write adapter
(`POST /sync/history`) registered in the provider routing table so `todos/005`'s
`useLogMedia` can fan out to it. Normalize responses into `NormalizedMediaItem`
(`types/media.ts`).

## Acceptance Criteria

- OAuth login flow works on web and native.
- Access token persisted via `react-native-mmkv`; 401s trigger refresh before failing.
- Watched shows render in the unified feed via a `useWatchedShowsQuery` hook
  (`state/queries/trakt.ts`).
- A Trakt write adapter exists (`lib/providers/trakt.ts`) implementing "log a movie"
  and "log a TV episode" for `lib/providers/routing.ts` to call — `todos/005` depends
  on this existing, not on a UI to trigger it yet.
- Any rate-limit or edge-case behavior discovered gets written to
  `docs/solutions/trakt-*.md` before this todo is closed.
