# Simkl rate limits, the 20-second write lock, and batching discipline

**Source:** https://api.simkl.org/api-rules + endpoint docs, read 2026-07-31
(plan 0034 KTD-3/U2/U4). The old Apiary docs are frozen and retire October
2026 — never consult them.

## The limits

- **10 GET/s and 1 POST/s**, keyed per `client_id` AND per user token.
  Sustained overage suspends the `client_id` "without warning, no appeal" —
  a harder failure mode than any other provider Shinobu integrates, and the
  bundled client id serves every install.
- **~20-second per-user write lock** on the `/sync/*` mutation endpoints. A
  second write inside the window returns `400` with a `rate_limit` body — not
  a 429. `src/lib/providers/simkl/http.ts` maps both shapes to
  `ProviderRateLimitError`, so the global retry predicate skips them (the
  AniList retry-storm lesson, `docs/solutions/anilist-rate-limit-retry-storm.md`).
- The CDN files (`data.simkl.in` calendar + trending) are **exempt from the
  quota** and Cloudflare-cached — the sanctioned place for parallel or
  always-fetched reads. Never add cache-busting params.

## Discipline the adapter encodes

- **Batch, never loop** (KTD-3): all four write endpoints take
  `movies[]`/`shows[]`/`anime[]` arrays. `logToSimkl` sends one POST per
  fan-out regardless of how many items/episodes it carries.
- **No derived second write inside the lock window:** the log flow's
  `removeWatchedFromWatchlist` follow-up is a second POST within a second of
  the first. The remove adapter went live in plan 0036, and this is the branch
  that flip had to deal with explicitly: **the derived path filters Simkl out
  of its targets outright.** The single-status model already evicted the film
  from `plantowatch` when the log landed, so there is nothing to remove — and
  `/sync/history/remove` deletes watch history, which is not a thing to fire
  speculatively inside the lock window
  (`docs/solutions/simkl-watchlist-remove-deletes-history.md`). The user's own
  removal, aimed from the picker, keeps its Simkl leg.
- **`/sync/activities` before `/sync/all-items`:** poll the cheap timestamp
  endpoint and refetch the heavy snapshot only on delta — the docs name
  timer-polling all-items as a suspension-worthy anti-pattern.
- **Always-fetched surfaces ride the CDN:** trending and calendar come from
  `data.simkl.in`, so per-client_id API volume scales with actively syncing
  users only, not with feed renders.

## Open items (probe on a live account before trusting)

- **Cap scope:** whether 10 GET/s is aggregate across all installs sharing the
  bundled client id, or per user token, is not stated precisely. If aggregate,
  adoption has a ceiling; the CDN bias above is the mitigation either way.
  Record the empirical answer here when the U2 manual leg runs.
- ~~**Single-status semantics**~~ — **resolved 2026-08-01, plan 0036.** Simkl
  holds ONE status per item and there is **no status-only removal**:
  `POST /sync/history/remove` with a whole-item body deletes the list entry,
  the watch history and the rating together. `watchlistRemove` is `'write'`
  now, with the hazard guarded rather than avoided — a fresh `plantowatch`
  read before the write, and a refusal on any row still holding history unless
  the picker took an explicit second confirm. Full finding and rollback:
  `docs/solutions/simkl-watchlist-remove-deletes-history.md`.

## Auth-adjacent facts that shape retries

- Tokens live ~5 years (`expires_in: 157680000`) and there is **no refresh
  grant**: a Simkl 401 is terminal — `ProviderAuthError`, reconnect, never a
  refresh loop (KTD-2).
