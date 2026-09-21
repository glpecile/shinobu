# A caught-up Simkl show vanished from Home the moment its episode aired

**Found:** 2026-09-21, owner report. A TV show tracked on Simkl sat in "This
week" until its air time, then disappeared from Home altogether and only came
back in Continue Watching hours later. Anime was unaffected.

## The chain

1. Simkl's `watching` snapshot **omits `next_to_watch` for a caught-up show**
   (`trackers-cant-tell-caught-up-from-finished.md`). Probed live: four
   caught-up shows with an episode hours away all read `next: null`.
2. `calendarEntry` drops an airing the instant it has aired, on the stated
   assumption that "the progress leg already produced the same episode". For
   Simkl it hadn't: there was no pointer to produce it from.
3. The pointer only returns once Simkl marks the episode aired *and* the
   15-minute `watching` snapshot is refetched, which nothing but an Up Next
   refetch triggers. Pull-to-refresh refetches the gather, not the snapshot
   inside it.
4. Even with data in place, nothing re-rendered at the air instant. React
   Compiler merges `const now = new Date()` into the same memo scope as
   `computeUpNext(data, now)`, so the split was only recomputed when `data`
   changed. A simulator left open showed a three-day-old "today".

Anime escaped because AniList states `airingAt` for the next episode ahead of
time, and AniList wins the dedupe.

Reproduced on the emulator: *High Value Target* S1E5 aired at 04:00:00Z and at
04:00:49Z was in neither section.

## Fix

- `simklInputs` (`state/queries/up-next.ts`) gives a pointerless row the
  calendar file's earliest unwatched airing (`calendarPointer`), unaired ones
  included. `progressEntry` classifies it at render time, so the episode moves
  from Calendar to Continue Watching at the file's air instant with no refetch.
  Simkl's own pointer takes over once it exists.
- `UpNextSection` holds `now` as state and passes it down to the compute.
  `useWakeAt` (`lib/time/use-wake-at.ts`) refreshes it at `nextSplitChange`,
  the next upcoming air instant or local midnight, and on return to the
  foreground. It lives in the component, not `state/queries/up-next.ts`: a
  dozen suites load that module under a `Platform`-only `react-native` mock.

## Rules

- A section that hands an item to another section at a boundary has to check
  the other one can actually receive it, per provider.
- Under React Compiler an ambient `new Date()` in render is cached with
  whatever consumes it. Anything that must move with the clock needs the clock
  as state.

Simkl's pointer `date` is day-granular (`2026-09-20T00:00:00-04:00` for an
episode the calendar file places at `2026-09-21T01:00:00Z`). Harmless for the
aired check once Simkl lists it, but it is not an air time.
