# Trakt `/sync/watchlist`: pagination is required, and the blueprint says otherwise

## Symptom (the one this prevents)

A watchlist read written straight off Trakt's Apiary blueprint sends no
`page`/`limit` — the action is badged `📄 Pagination Optional` — and silently
returns **the first 100 items**. Nothing errors. A user with 300 watchlisted
films sees 100, the merged watchlist surface looks complete, and the missing
two-thirds are indistinguishable from "the user never added them".

## Cause

[trakt-api discussion #681](https://github.com/trakt/trakt-api/discussions/681)
lists `/sync/watchlist` among the endpoints whose pagination becomes
**required**:

- Omitting `page`/`limit` no longer returns everything — the response defaults
  to **100 items** (April 2026).
- The **maximum `limit` was cut from 1,000 to 250** on **2026-06-15**.

The Apiary blueprint was **not** updated to match: as of its 2026-06-19 revision
the watchlist action still carries the `📄 Pagination Optional` badge. The
announcement is the authority; the badge is stale. Anyone who checks only the
blueprint will ship the truncating read.

## This is a *different* announcement from #775

`docs/solutions/trakt-watched-endpoints-2026-api-changes.md` covers
[discussion #775](https://github.com/trakt/trakt-api/discussions/775) — the
`/sync/watched/*` and `/users/:id/watched/*` changes (images removed, season
progress behind `extended=progress`, pagination required after 2026-06-30).
**#681 is a separate, wider announcement** and names watchlist explicitly.
Reading one and assuming it covers the other is how this gets missed: #775 says
nothing about watchlist, so "watchlist isn't in the breaking-change doc" is a
false conclusion drawn from the wrong doc.

## Fix

`getWatchlist` (`src/lib/providers/trakt/reads.ts`) **always** sends both
params, at the current ceiling:

```
/sync/watchlist/{type}/{sortBy}/{sortHow}?extended=full,images&page=N&limit=250
```

and loops until a short page. The loop is **not** a second hand-rolled one: the
existing `/sync/watched/*` pagination helper was generalized from
`getWatchedPages` to **`getPagedSync`** and is now shared by every paginated
sync read, so the short-page stop condition and the `SYNC_MAX_PAGES = 10` cap
cannot drift apart per endpoint (plan 0031 KTD-16).

Rules that outlive this specific endpoint:

- **Never rely on "one request returns everything" from a Trakt sync endpoint**,
  whatever the blueprint badge says.
- **Keep `limit ≤ 250`.** A larger value is not clamped-with-a-warning; it is
  the 1,000-era value and no longer valid.
- **A short page is the only stop signal.** A full page followed by an empty one
  is normal and terminates on the next iteration.

## Open item: `extended=full,images` on watchlist rows

`extended=full,images` is the blueprint's global option, and #775's image
removal was scoped to `/sync/watched/*` and `/users/:id/watched/*` — watchlist
is **not** named in it — so watchlist rows are expected to still carry art.

**Status: UNVERIFIED against a live watchlist response** as of 2026-07-28. This
line is the place to record the observation when someone runs it against a real
account: note whether `images` is present, and on which row types.

If it turns out images are gone here too, the fallback already exists and costs
nothing new: `useTraktMediaImages` (`src/state/queries/trakt.ts`) recovers
poster/backdrop per *rendered* artless card from the catalogue endpoint, which
is exactly how the watched feed survived #775. No normalization or design change
would be needed — only the observation recorded here.

## Related

- `docs/solutions/trakt-watched-endpoints-2026-api-changes.md` — #775, the
  watched-endpoint changes. Different announcement, same "the docs lag the
  announcement" failure mode.
- `docs/plans/0031-watchlist-read-and-write.md` — KTD-16 (this decision), U11
  (the read).
