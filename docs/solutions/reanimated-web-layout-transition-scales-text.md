# Reanimated `layout` transitions scale their subtree on web, squashing text

**Symptom (2026-09-09).** Giving `components/button`'s box a
`LinearTransition` so the pill could grow smoothly when `loading` swapped
"Connect" for a spinner + "Connecting…" looked right on iOS but wrong in the
browser: mid-transition the label rendered squashed to a fraction of its width,
then stretched wide on the way back.

## Cause

On native, Reanimated's layout animations animate the view's frame; Yoga lays
the children out at their final positions and the label is never distorted. On
web the same `layout` prop is implemented as a CSS animation on `transform`
(translate + **scale** from the old box to the new one), so everything inside
the animated element — text included — is scaled with it for the duration.
There is no preset that avoids this: it's how the web implementation works.

## Fix

`components/button` applies `layout` only off-web
(`Platform.OS === 'web' ? undefined : LinearTransition…`), and the default
loading treatment no longer changes width at all: without a `loadingLabel` the
spinner overlays the label (`absolute inset-0`) while the label fades to
`opacity-0` but stays in layout to hold the pill's width. That is pure opacity,
identical everywhere, and it is what the hugging Connect rows use.

Rule of thumb: on web, only put a `layout` transition on a container whose
children are safe to scale for ~200ms (a poster, a solid block), never on one
that shows text.
