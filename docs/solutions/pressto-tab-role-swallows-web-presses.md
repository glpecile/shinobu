# `accessibilityRole="tab"` on a pressto pressable swallows every press on web

**Symptom (2026-09-10).** The new `components/segmented-control` rendered fine
on web but no segment responded to a click. Playwright's `elementFromPoint`
put the click squarely on the segment's own `div[role=tab]`; the route never
changed. The same `PresstableOpacity` with `accessibilityRole="button"` (the
watchlist toolbar's grid/list toggle, the year button beside it) worked.

## Cause

Swapping the role back to `button` fixed it with no other change. pressto's
web pressable rides react-native-gesture-handler's button, and the `tab` role
is the one thing the two call sites did not share. Not chased further than
that — the app has no other `tab`-role pressable to protect.

## Rule

Pressables through `@/components/presstable` keep `accessibilityRole="button"`
(or none). Express selection with `accessibilityState={{ selected }}` and a
group label on the container, never with `tab`/`tablist`.
