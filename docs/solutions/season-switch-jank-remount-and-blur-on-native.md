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
