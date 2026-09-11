# Season switch jank on iOS is a list remount under a blur filter

## Symptom

Tapping between cours in the AniList seasons explorer (`/anime-seasons`)
stuttered badly on iOS (dev client, iPhone 17 Pro simulator and device) while
the same switch looked fine on web. The entrance animation dropped most of its
frames and the wall arrived with a visible hitch.

## Cause

Two costs landed on the same frame:

1. **A Legend List remount per tap.** The wall was keyed by season, so every
   switch unmounted one list of poster cells and mounted another. Mounting a
   screenful of cells is the expensive part of any list here
   (`diary-scroll-jank-is-row-mount-cost.md`), and it ran exactly when the
   animation started.
2. **A `filter: blur` on the list container.** RN 0.86's iOS `filter` is a
   SwiftUI-backed effect that re-rasterizes the whole scroll view every frame it
   animates. On web the same rule is a GPU-composited CSS filter and costs
   nothing, which is why the design read as fine there.

No easing or duration change fixes either.

## Fix

- **Cours are horizontal pages** (`features/anime-seasons/season-pager.tsx`): a
  plain `ScrollView` with `pagingEnabled` — native paging on iOS/Android, CSS
  scroll snap on web (react-native-web maps it to `scroll-snap-type`), no pager
  library. The selected cour and its two neighbours stay mounted, so a swipe
  reveals a wall that already exists and a tab tap is a scroll, not a remount.
  Neighbours mount after the scroll settles (`onMomentumScrollEnd`), never
  mid-gesture. Pages get explicit sizes from the pager's measured layout
  because a horizontal scroll view does not stretch children's height on
  every platform.
- **The blur is web-only** (`features/anime-seasons/wall-entrance/`): the
  native keyframes are a short rise, the web ones add the blur. Platform
  variants by directory, per the file conventions.
- **One actions sheet** at the screen, passed down as `onItemActions`, instead
  of one per mounted wall.
- **The strip's pill rides the scroll.** The pager is a Reanimated
  `Animated.ScrollView` whose `onScroll` worklet writes `offset / width` into a
  shared value on the UI thread; `SegmentedControl` takes it as `progress` and
  positions the pill from it with `useAnimatedStyle` instead of its own CSS
  transition. The pill is under the finger mid-swipe and moves with the page
  when a tab tap scrolls there, on every platform, with no JS on the gesture.

## Web: settle only at rest

react-native-web's ScrollView never fires `onMomentumScrollEnd`; it emits
`onScroll` only, and with `scrollEventThrottle` at 0 that means exactly *two*
events per scroll — one on the first moved frame and one 100ms after the last.
Settling from that first event (or from any sample taken while a tab tap's
page scroll is in flight) reads the page being *left*, and the URL snaps
straight back to it — the "always reverts to the current season" bug. With
`scrollEventThrottle={16}` every frame emits, a quiet-period timer that every
event resets only ever fires at rest, and a resting offset with mandatory
snap is a page boundary (±2px for fractional zoom).

Year and format changes still remount (they are new walls), but they are
discrete taps, and the native entrance is now a transform only.

## Rule

Don't animate a `filter` on a list container on native, and don't remount a
virtualized list on the frame an animation starts. When the user moves
between siblings of one collection, keep the siblings mounted and move
between them.

## See also

- `wall-swap-black-flash-posters-not-decoded.md` — why the entrance has no
  opacity and why posters are warmed before the wall mounts.
- `entering-animation-on-virtualized-cells-replays.md` — why the entrance is on
  the container, not the cells.

## Web: tab taps drive `scrollLeft` themselves

`scrollTo({ animated: true })` on react-native-web is the browser's smooth
scroll, whose duration scales with distance and is not settable: measured at
550ms for one page and ~970ms for three, past the 300ms ceiling where motion
stops reading as feedback. Reanimated's `scrollTo` is a no-op on web. The
pager now animates a shared value with `withTiming` (the pill's duration and
curve, `DURATION.toggle` + `TIMING_EASE_IN_OUT`) and writes it to the DOM
node's `scrollLeft` each frame, with `scroll-snap-type` set to `none` for the
flight: under `mandatory` snap Chrome re-snaps every mid-page write straight
back to the page it started on (a `scrollLeft = 500` read back as `0`). Snap
is restored in the timing callback, once the offset sits on a page boundary.
A tap mid-flight retargets from the current offset.

## The pill's text colour: a clipped copy, not a fade

Fading each label between foreground and background can only be keyed to the
settled `value`, so it lagged the pill during a swipe and jumped at the end.
`SegmentedControl` now renders the pill as an `overflow-hidden` copy of the
whole label row in inverted colours, counter-translated by the same amount
the pill moves, so the inverted text *is* the pill and tracks it to the pixel
at every position. Both the pill and the copy read the same `progress` shared
value (or the same CSS transition when there is no pager).

## Year changes show the skeleton on purpose

Router param updates are React transitions, so a year tap kept last year's
posters up until this year's had loaded — even with the year no longer
deferred. React's documented opt-out is a `key`: the wall boundaries are keyed
by year, so a new boundary mounts and shows its skeleton at once. Format stays
deferred: All ⇄ TV narrows the same titles, and holding them reads as intended.
