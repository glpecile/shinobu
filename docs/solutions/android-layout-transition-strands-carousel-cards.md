# Android: `LinearTransition` strands Continue Watching cards

**Found:** 2026-09-21, owner report ("stuck loading and did not disappear")
after logging the latest episode of a Simkl show.

## Symptom

Reanimated 4.5.1, Android, the horizontal Continue Watching `ScrollView`. Each
card carried `layout={LinearTransition}` and `exiting={FadeOut}`. Whenever the
row's membership changed the neighbours ended up in the wrong place and stayed
there until the app restarted:

- a card removed after a log: the next card stopped part-way through its slide,
  leaving a gap at the head of the row;
- cards inserted at the head (an episode airing, a refetch): the old cards kept
  their positions and were drawn on top of the new ones, titles overlapping.

3 of 3 membership changes reproduced it on the Pixel 9 emulator. With the
`layout` prop removed, the same log left every card where native layout puts
it. iOS runs the same transition correctly (insert and remove checked on the
iPhone 17 Pro simulator).

## Fix

`CARD_LAYOUT` in `features/up-next/up-next-section.tsx` is iOS only. Android
keeps the exit fade and snaps the neighbours, as web already did.

## Rule

Check a Reanimated layout transition on Android with a real membership change
(insert at head, remove from head) before shipping it. A stranded view never
recovers on its own, because no later layout pass moves it.
