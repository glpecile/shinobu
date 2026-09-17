# Home carousel posters "die" on Android: expo-image's default skips the memory cache

## Symptom

Flinging the home feed's horizontal rows on Android, posters blank out and fade
back in a beat later; after a lot of it the app feels sluggish (owner report,
2026-09-17).

## What adb said

Pixel_9 emulator, debug dev client, one script: 40 `input swipe` flings across
two carousel rows, `dumpsys meminfo` / `gfxinfo` around it, `logcat` filtered on
Glide.

Every poster load was a **disk decode**, never a memory hit, and the same URL
was decoded up to four times in 40 flings:

```
35 × "Glide: Finished loading BitmapDrawable from DATA_DISK_CACHE … in 44–110 ms"
 0 × from MEMORY_CACHE
```

That is the blank-then-fade: a card scrolled back into the draw window mounts
empty, waits on a disk read + decode, then cross-dissolves in. The cause is in
expo-image's Android source, not in the list: its default `cachePolicy` is
`DISK`, and `ExpoImageViewWrapper.kt` maps anything but `MEMORY`/`MEMORY_AND_DISK`
to Glide's `skipMemoryCache(true)`. iOS (SDWebImage) keeps a memory cache under
the same default, which is why this only ever showed on Android.

Two things that looked like the cause and measured as nothing:

- **Legend List remounting cards** (`recycleItems` off, 250px `drawDistance`).
  Recycling plus `drawDistance = 4 cards` changed neither the UI-thread frame
  counts (`Slow UI thread` 209 → 210 of ~240 frames) nor the memory curve, and
  under the `disk` policy it *doubled* disk decodes (35 → 71) because a
  recycled cell swaps sources as often as an unmounted one remounts. Reverted.
- **A leak.** `Views:` in `dumpsys meminfo` sat at 950 before and 949 after the
  script; native heap moved −6 to +30 MB run to run with no trend.

The per-frame jank numbers (median 69–77 ms, ~97% janky) were identical across
all four configurations, so they are the emulator + debug-bundle floor for a
synthetic drag, not a signal about the carousel. Re-measure on a release build
on device before quoting them.

## Fix

`components/image.tsx` defaults `cachePolicy` to `memory-disk`. One line, at the
one place expo-image is imported, so every poster/still/headshot in the app
gets it. Glide's memory cache is a bounded LRU sized from the screen; heap did
not grow across repeated scripts with it on.

## Result

Same script, same rows, after the change:

```
25 × from MEMORY_CACHE     (instant, no decode)
 7 × from DATA_DISK_CACHE  (first pass after a reload)
```

Cards scrolled back into view paint from memory. Repeat the script and the
disk count goes to ~0.
