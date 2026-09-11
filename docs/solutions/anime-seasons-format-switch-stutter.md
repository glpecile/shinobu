# The seasons explorer's format switch stutters on iOS and is fluid on web

## Symptom

(owner, 2026-09-11, iOS 26 simulator, dev client.) Tapping All / TV / Movies on
`/anime-seasons`: the pill slid, then a long pause, then the cards changed —
"one thing moves, then the next" — and switching fast "fell apart". The same
control on web was fluid throughout. No curve or duration change touched it.

## Cause

Three costs, all of them on the frames the pill is animating, and **all three
free on web**. The pill is a Reanimated CSS transition: the browser composites
it off the main thread, so nothing the app does can reach it, while on native it
runs on the UI thread — the thread that also renders cells and mounts views.

1. **Three walls, not one.** `season-pager.tsx` deliberately keeps the selected
   cour *and its two neighbours* mounted. A format change is a prop change for
   all three, so one tap re-read AniList, re-warmed posters and re-rendered
   cells for three walls at once — and cost three requests against the 30/min
   budget (`anilist-rate-limit-retry-storm.md`).
2. **A remount per tap.** The wall was keyed by format, so narrowing to Movies
   unmounted a Legend List of poster cells and mounted another: the exact frame
   the pager exists to avoid for cours
   (`season-switch-jank-remount-and-blur-on-native.md`).
3. **A desktop's worth of poster warm-up.** `useWarmPosters` suspends the swap
   until the first screen of posters is prefetched
   (`wall-swap-black-flash-posters-not-decoded.md`); "first screen" was the
   constant 24 — eight columns by three rows, a *desktop* wall. On a phone
   showing nine, every switch waited on three screens of images it would never
   paint. This is the gap between the pill landing and the cards changing.

## Fix

- **Only the cour in front of the user follows the format immediately.** The
  two behind the edges take it one `DURATION.toggle` later
  (`useTrailingFormat`), which a swipe cannot outrun.
- **Warm the first screen the device actually has** — `columns * 3` from
  `useWallMetrics`, passed in rather than assumed.
- **Do not delay the swap itself.** An earlier attempt held the wall back until
  the pill landed; that only made the sequence explicit. The swap lands when its
  data and posters are ready, which on a cached format is inside the slide.

## Keep the skeleton: a router param update is a transition on native only

Dropping the format from the wall's key (no remount) removed the stutter and
also removed the *feedback*: on native the tap changed nothing visible until the
new posters arrived. Web did not have this problem — a route param update is a
React transition on native, which keeps the old content revealed while the new
render suspends, and is not one on web, where the boundary falls back.

So the boundary is keyed by format as it already was by year: a fresh boundary
is React's documented opt-out from a transition's held content, it shows its
skeleton at once, and both platforms now answer the tap the same way. Keyed by
the format the page is *rendering*, not the URL's — an off-screen cour trails,
and a key running ahead of its prop remounts it onto the format it already had.

## Rule

Any work a control triggers on native lands on the same thread as the control's
own animation. Before tuning a curve, count what the tap actually costs: how
many mounted subtrees take the prop, whether any of them remount, and what the
new content is made to wait for.
