# Swapping a poster wall flashes black for a few frames

**Symptom (2026-09-10).** Switching cour or format on `/anime-seasons` showed a
split-second black screen before the new posters appeared. Invisible at a glance,
obvious in a 120fps screen recording: 1–6 frames at the bare background luma on
every switch.

## Cause

Two things stacked, and removing the first one was not enough:

1. The wall's entrance faded in from `opacity: 0`. The previous wall is already
   unmounted when the new one mounts (it is keyed by window), so the first
   frames paint the background only.
2. Even at full opacity the new wall's `<img>`s have not loaded or decoded on
   the frame they mount. The cells paint empty for as long as the images take to
   arrive — 4 frames on a warm cache, longer cold.

Measured with a CDP screencast (`Page.startScreencast`) and per-frame luma via
`ffprobe … signalstats`: opacity gone → still `77 → 16 16 16 16 32 51 61 66 76`.

## Fix

- The entrance animates blur and a rise only, never opacity.
- `useWarmPosters` (`features/anime-seasons/warm-posters.ts`) is a second
  suspense query keyed under the wall's, awaiting `prefetchImages` on the first
  screen of posters (24, capped at 1200ms), so the `useDeferredValue` that
  already holds the old wall through the data fetch holds it through the
  images too. After: `77 → 71 71 71 75 76`.

`prefetchImages` lives in `components/image.tsx` (the only expo-image import).
On web it is `new Image()` + `onload`; decode still happens at paint, but for
poster-sized JPEGs that fits in a frame. **It cannot be called from
`state/queries/*`:** expo-image imports React Native's Flow sources, and any
`*.test.ts` that imports the query module then fails to load under `bun test`
(17 files went missing from the run before this moved to the feature).

## Rule

A surface that replaces itself as one piece (a keyed wall, a swapped grid) must
not start from opacity 0, and whatever suspense holds the old surface should
also hold for the first screen of images. Per-cell fades are not the answer
(`entering-animation-on-virtualized-cells-replays.md`).
