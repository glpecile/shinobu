# A sheet that measures its children to decide how to wrap them loops forever

**Symptom (2026-07-26).** On Android, opening the log sheet on an account with a
large tag vocabulary put it in a permanent flicker: the tag chips expanded to
five rows and the sheet grew past the top of the screen, then snapped back to a
single row of chips, then expanded again — several times a second, forever. The
app died after a few seconds of it. Screenshots of the two alternating frames
looked like two different sheets; they are the same sheet one frame apart.

## Cause

`components/sheet`'s `SheetContent` chose its wrapper from a measurement of the
thing it was wrapping:

```tsx
function measure(event) { setOverflows(event.nativeEvent.layout.height > maxHeight) }
const body = <View onLayout={measure}>{children}</View>
if (!overflows) return body                      // plain View
return <ScrollView style={{ maxHeight }}>{body}</ScrollView>   // …or a scroller
```

That `if` reads like a style change. It is an **unmount**: React sees a
different element at the root of the returned tree, so `body` and everything
under it are thrown away and rebuilt, losing all their state.

`TagPicker` keeps its layout measurements in exactly that state — it renders its
chips, measures one row against the whole wrapped block, and collapses to a
single row if the block is taller. Remounted, it forgets it ever collapsed and
paints the full vocabulary again. So:

1. Chips collapse → content is short → `overflows` false → **remount** →
2. picker forgets → paints five rows → content is tall → `overflows` true →
   **remount** →
3. picker forgets, paints five rows, measures, collapses → back to 1.

Neither component is wrong on its own. The loop only exists because the parent's
wrapper decision and the child's height decision are each derived from the
other's output, with a remount in the middle erasing the child's memory of the
last round.

## Fix

The scroller is always in the tree, and only its *height* changes:

```tsx
const { height, scrollEnabled } = sheetScrollMetrics(contentHeight, maxHeight)
<View style={height == null ? undefined : { height }}>
  <ScrollView scrollEnabled={scrollEnabled}>
    <View onLayout={measure}>{children}</View>
  </ScrollView>
</View>
```

Nothing unmounts, so no child can be reset by a resize, and there is no feedback:
the scroller's height depends on the content, and the content's height does not
depend on the scroller (children lay out unbounded along the scroll axis).
`sheetScrollMetrics` is pure and unit-tested (`components/sheet/metrics.ts`).

**The height goes on a wrapping `View`, not on the scroller.** For one frame —
before the first `onLayout` — there is no height to give, and a `ScrollView`
with no height fills whatever contains it. That frame is the one the sheet's
native `'content'` detent measures, so putting the height on the scroller itself
made *every* sheet open at the 85% cap. An auto-height `View` has nothing to
fill: with no definite height above it the scroller's `flexGrow` has no free
space to claim and reports its content instead.

**`scrollEnabled` matters even when the content fits.** An always-mounted
scroller that is enabled swallows the drag that would otherwise move the sheet,
so a short sheet quietly stops being draggable-to-dismiss.

## The related half: measure the steady state, not the first frame

The bottom sheet's `'content'` detent does follow the subtree in both directions
— collapsing a section shrinks the sheet back — but it follows what it is given,
and what it was given on the first frame was a tag picker painting its entire
vocabulary before collapsing. So the sheet opened at the cap. In the pre-fix
shapes (wrapper swap, and height on the scroller itself) it then *stayed* there,
a screen of dead space under its buttons; with the fix it snaps down instead,
which is better and still wrong.

So `TagPicker` now assumes it overflows until it has measured, clipping to an
estimated row height (`ESTIMATED_ROW_HEIGHT`) instead of painting every chip. A
guess that is a pixel or two wrong costs one frame of a slightly clipped row;
guessing the other way costs the sheet's entire opening height.

## Rule

**Never choose an element *type* from a measurement of the subtree inside it.**
Change its style. If a wrapper genuinely has to appear or disappear, hoist the
state that decides it above the boundary that remounts, or accept that
everything inside restarts every time it flips.
