# Mounted pager skeletons keep animating offscreen

`Pager` keeps adjacent pages mounted so a swipe reveals an existing list
instead of mounting one on the gesture frame. Its clipping and accessibility
flags do not stop Reanimated CSS loops inside a suspended page.

Anime Seasons' list fallback has eight rows with three `Skeleton` blocks each.
Two loading neighbours therefore add 48 infinite pulses the user cannot see.
Keep the neighbours mounted, but pass the selected page's `active` flag through
`WallBoundary` → `WallSkeleton` → `Skeleton.animated`. Static blocks use the
same opacity as reduced-motion blocks and declare no animation. Letterboxd's
standalone wall fallback retains the default pulsing behavior.

CSS animations also need explicit reduced-motion guards: they do not inherit
`withTiming`'s system behavior. `FloatingTile` retains its constant tilt but
omits the bob's animation name when reduced motion is enabled.

These remove unnecessary animation work, not a measured FPS regression.
Verify animation declarations and visibility before attributing profiler
timing changes to this fix; cached data may never show a fallback at all.
