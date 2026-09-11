# An animated style's first paint is its *first render*, not its first mount

**Symptom (2026-09-11).** Reloading `/anime-seasons?season=SUMMER` flashed
**Winter**: the season strip's pill painted on the first segment for a frame or
two, then jumped to Summer as the wall appeared. The format strip beside it,
built from the same `components/segmented-control`, showed the right segment
from the first frame.

## Cause

`useAnimatedStyle` computes its **initial** value once, on the render the hook
is first called, and never again (`hook/useAnimatedStyle.js`):

```js
if (!animatedUpdaterData.current) {
  const initialStyle = initialUpdaterRun(updater);   // ← once, ever
  animatedUpdaterData.current = { initial: { value: initialStyle, … }, … };
}
```

That `initial.value` is what `createAnimatedComponent` renders inline; the real
worklet result only lands from an effect, i.e. **after the first paint**.

The pill's offset is `progress.value * segmentWidth`, and `segmentWidth` comes
from the control's own `onLayout` — it is `0` on the first render, by design
(the pill isn't rendered until the control is measured, so it has nothing to
slide from). But the *hook* ran on that first render anyway, because it sat in
the parent, so `initial` was frozen at `translateX(0)`: segment one, Winter.

The format strip escaped it only because it takes no `progress` and uses a
plain style object, which React re-renders with the right value.

## Fix

Move the animated styles into the element they style, mounted only once the
measurement exists (`SelectionPill` in `components/segmented-control.tsx`). Its
first render *is* the measured one, so `initial` is the resting position.

**Rule: an animated style whose worklet closes over layout state belongs in a
component that does not render before that state is known.** Gating the JSX is
not enough — the hook has to be gated with it.

## Verifying

A `MutationObserver` installed with Playwright's `addInitScript` records each
element's inline `style` the moment it enters the DOM — before any effect can
correct it, so it cannot race the fix:

```
before: transform: translateX(0px);     ← Winter
after:  transform: translateX(502px);   ← Summer (2 × 251px segment)
```

## Related

- `reserve-the-row-a-late-control-will-need.md` — the other half of measurement
  arriving late.
- `web-headless-smoke-test-playwright.md` — the harness.
