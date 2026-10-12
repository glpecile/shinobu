# Web: a covered screen reports a zero layout, unmounting size-gated content

## Symptom

On web, scrolling the anime-seasons wall, opening a title, and pressing Back
always landed back at the top of the wall. Search (a plain virtualized list)
kept its position, so this looked like a Legend List problem — it wasn't.

## Cause

Expo Router's web `Stack` (`NativeStackView`) renders every route and hides
the covered ones with `display: none` — hardcoded, no `detachInactiveScreens`
opt-out exists on that path (passing it via `screenOptions` is silently
ignored; verified against the bundled `NativeStackView` source).

A `display: none` subtree reports a zero layout, so `Pager`'s `onLayout` fired
with `{width: 0, height: 0}` the moment details pushed over it, and the
`size.width > 0` gate unmounted every page — including the wall holding the
scroll position. Back then mounted a brand-new wall at offset 0. Confirmed in
a real browser: while details was focused, zero poster buttons remained in the
DOM; after the fix, 122 stay mounted.

## Fix

`components/pager.tsx` ignores zero-size layouts and keeps the last measured
size, so covered pages stay mounted and Back lands where the user left off.
The initial mount still starts at `{0, 0}` and takes the first real layout,
so nothing about first paint changes.

## Rule of thumb

Any `onLayout`-gated mount (`size.width > 0 && …`) is a scroll-position trap
on web: hiding is a zero layout, and a zero layout must never read as "no
space". Keep the last non-zero size instead.
