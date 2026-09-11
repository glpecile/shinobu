# An `entering` animation on a virtualized list's cells replays on every fast scroll

**Symptom (2026-09-10).** The seasons explorer's poster wall and `/watchlist`
got a staggered rise-and-fade on each cell. Scrolling either list down and up
quickly on web made posters and rows keep appearing and disappearing with that
animation.

## Cause

Ours, not Legend List's. Reanimated's `entering` runs on **mount**, and a
virtualized list unmounts cells that leave the viewport and mounts them again
when they scroll back — every return trip is a fresh mount, so the entrance
replays. `recycleItems` would mask it (cells are reused, not re-mounted) but it
is off app-wide for the hover-state reason in `components/List`, and it would
only hide the mistake.

Bluesky's `List` (FlashList/FlatList) never attaches mount animations to rows
for exactly this reason; entrances there belong to state changes, not to
scrolling.

## Rule

Never put `entering`/`exiting` on a `renderItem` cell. Animate the **list's
container** once — the explorer wraps its layout in one `AnimatedView` keyed by
the season window, so a new wall rises in on first load and on every
season/format switch, and scrolling touches no animation at all. Presets only
(`FadeIn`, `FadeInUp`), per
`reanimated-web-keyframe-pins-position.md`.
