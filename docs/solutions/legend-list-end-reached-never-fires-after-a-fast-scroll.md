# Legend List `onEndReached` never fires after a fast scroll

## Symptom

On web the diary stops at the first page: fling or drag the scrollbar to the
bottom and no footer spinner appears and no page 2 request is made. Scrolling
down slowly paginates normally. Native looked fine because a momentum scroll
emits a stream of scroll events on the way down. The watchlist's Letterboxd
leg is behind the same `onEndReached` and was broken the same way.

Reported against the diary commits (#85–#87); those were innocent. The query
reported `hasNextPage: true` with the next cursor ready and `onEndReached` was
simply never called.

## Cause

`@legendapp/list` 3.3.3 added a shared "edge reached" gate so
`onStartReached` and `onEndReached` don't bounce between edges during one
gesture (its CHANGELOG). The gate closes whenever *either* edge crosses its
threshold, **whether or not a handler for that edge exists**. Every list
mounts at scroll 0, inside the default `onStartReachedThreshold` (0.5 of the
viewport), so the gate closed on mount. It reopens only while the scroll
position is outside *both* edges' hysteresis bands (1.3× threshold), or on the
first user scroll after a scroll-end. A single fast jump from the top straight
into the bottom band skips the reopening region, and once the list sits at the
bottom no further scroll events arrive, so nothing ever reopens it.

The repo went 3.3.2 → 3.3.10 in the dependency refresh (#73, 2026-09-07).

## Fix

`components/List` (both variants) defaults `onStartReachedThreshold` to 0. A
zero threshold means the top edge is never "reached", so it never closes the
gate; the bottom edge closes and reopens it on its own, which is the behaviour
we want. Nothing in the app uses `onStartReached`; a future caller must pass
its own threshold and re-verify the fast-jump case.

Verified with a headless Chrome run against `bun web` (a faked Trakt session,
`/sync/history` intercepted to return 50 rows per page, one 20,000px wheel per
step): before, page 1 only; after, one new page per jump.

## Not the fix

- Anything in `use-diary-feed.ts` / `diary-pages.ts`: the cursor logic was
  correct and unit-tested throughout.
- Pinning Legend List back to 3.3.2: loses the batched row measurement and the
  other 3.3.x fixes for a one-prop workaround.

Upstream: the gate should only be marked for an edge whose handler is set;
worth an issue on `LegendApp/legend-list`.
