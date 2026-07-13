---
status: in-progress
date: 2026-07-10
---

# 0009 — Search Movies & Series (Trakt)

## Context

The feed only shows trending + watched items, so anything else is unreachable —
you can't look up a specific film to open its details (or, with plan 0008, log
it). Trakt's `GET /search/:type` is public (client-id header only, no OAuth),
CORS-open like the rest of the API (`docs/solutions/web-cors-trakt.md`), and
returns the same `movie`/`show` payload shapes the trending normalizers already
handle — so search is a thin new read, not a new integration.

## Decisions

1. **Endpoint**: `GET /search/movie,show?query=…&extended=full,images&limit=…`
   — one request covers both types; each result row is
   `{ type: 'movie' | 'show', score, movie? | show? }`.
2. **Normalization reuses the trending path.** Extract `normalizeMovie` /
   `normalizeShow` (raw `TraktMovie`/`TraktShow` → `NormalizedMediaItem`) from
   the trending normalizers, and add `normalizeSearchResult` on top. Rows whose
   `type` we don't handle (Trakt also indexes episodes/people/lists) drop out
   with `null`, never throw — forward-compatible with Trakt widening results.
3. **Query hook**: `useTraktSearchQuery({ query })` in `state/queries/trakt.ts`
   (read hook per provider domain, AGENTS.md), key
   `traktQueryKeys.search(query, limit)`. `enabled` only for non-empty trimmed
   queries; `placeholderData: keepPreviousData` so the list doesn't flash empty
   between keystrokes; `staleTime` 60s — search results don't churn.
4. **Debounce via `useDeferredValue`**, not a hand-rolled timer: the input
   stays fully responsive and React schedules the query-key change at lower
   priority. (No `useMemo`/`useCallback` — React Compiler.) Each *settled*
   query string becomes its own cache entry, which TanStack dedupes.
5. **Screen**: `src/app/search.tsx` (route in `lib/routes.ts`, entry point: a
   search icon in the home header). Results render as full-width rows (poster
   thumb + title + year/type) through the `components/List` wrapper — a
   result list is a long virtualized list like every other core surface, and
   rows beat 160px cards for scanning titles.
6. **Details navigation needs a cache fallback.** `details/[id]` currently
   resolves items only from the unified feed, so a search result would land on
   "Not found". Fix: after the feed lookup misses, scan the TanStack cache for
   search results (`traktQueryKeys.searchRoot()` prefix) containing the id.
   The full provider-fetch fallback for cold deep links stays with plan 0007's
   `details.ts` adapter — out of scope here.

## Verification gates

- Unit (`bun test`): `normalizeSearchResult` — movie row, show row, unknown
  `type` → dropped, missing payload → dropped.
- Live: search a title on web + one native platform; tapping a result opens
  details with people/studios sections working (they key off the Trakt id,
  which search results carry). Any pagination/`limit` surprise →
  `docs/solutions/trakt-search.md`.

## Out of scope

- AniList search (anime/manga) — joins when `todos/002` lands; the screen
  already renders `NormalizedMediaItem`s, so it aggregates the same way
  `useUnifiedFeed` does.
- Pagination / infinite scroll (first page of results is enough to start).
- Search history / recent queries.
