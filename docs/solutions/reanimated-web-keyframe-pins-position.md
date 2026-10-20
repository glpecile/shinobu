# A custom Keyframe `entering` animation pins the element to `position: absolute` on web

**Symptom (2026-07-27).** Giving the log sheet's tag chips a rise-and-fade
entrance broke the picker on web: pressing "Show more" painted every chip on top
of the confirm and Cancel buttons, and "Show less" landed *inside* the first
chip. Collapsed, it looked fine — which is what made it confusing.

The chips were laid out correctly (wrapped rows, right spacing) but occupied no
height, so everything below them rode up over them.

## Cause

The entrance was a `new Keyframe({ 0: {...}, 100: {...} })`. On web, Reanimated
runs a cleanup pass after any animation whose name is **not one of its own
presets** (`layoutReanimation/web/componentUtils.ts`):

```js
if (!(animationName in Animations)) {
  scheduleAnimationCleanup(animationName, duration + delay, () => {
    if (shouldSavePosition) {
      setElementPosition(element, getSnapshotForElement(element)); // ← here
    }
    …
  });
}
```

`setElementPosition` writes the snapshot back as inline style:

```
position: absolute; top: 0px; left: 112.578px; width: 92.28px; height: 36px; margin: 0px;
```

Every chip left the flow, so the wrapping `flex-row flex-wrap` row measured
**0px** tall. Absolutely-positioned children can't be clipped out of an
auto-height parent either, so they painted over the buttons below.

`Animations` holds only the built-in presets (`FadeIn`, `SlideInDown`, …), so a
preset never reaches this branch. **The behaviour is specific to custom
`Keyframe`s, and to web** — native honours the keyframe and leaves layout alone.

Other custom-`Keyframe` entrances need the same scrutiny:

- `components/sheet/index.web.tsx` — the panel's wrapper fills a fixed
  overlay, which looked safe until the overlay resized: with
  `interactive-widget=resizes-content`, the Android keyboard shrank the overlay
  but the wrapper kept its pinned open-time height, so the bottom-anchored
  panel sat behind the keyboard (Firefox for Android, 2026-10-20). It now uses
  `FadeInDown`/`FadeOutDown`. The backdrop's custom `Keyframe` is still pinned,
  but an oversized scrim is harmless.
- `features/up-next/up-next-section.tsx` — the day's content formerly used a
  reserved-height wrapper. That preserved the feed's height but did not make
  the snapshot safe while scrolling; it now uses `FadeIn` on web. See
  `firefox-calendar-cards-displaced-after-scroll.md`.

## Fix

Use a **preset** for anything that has to stay in the layout flow. The tag chips
stagger with `FadeIn.duration(…).delay(step * 20)` — one builder per stagger
step at module scope — and gave up the 4px rise:

```tsx
const chipEntering = Array.from({ length: CHIP_STAGGER_STEPS }, (_, step) =>
  FadeIn.duration(DURATION.swap).delay(step * CHIP_STAGGER),
);
```

A `.delay()` on a preset is safe: web sets `animation-fill-mode: backwards`
whenever an entering delay is non-zero, so the element holds its 0% frame
through the delay instead of flashing in and out.

## Rule

**Custom `Keyframe` on web only for elements whose size never needs to change
after they enter.** A fixed overlay is not enough: the viewport can resize under it. Reserved space does not protect a scrolling element
from a stale viewport snapshot. Anything
that must contribute its own height to a flow parent (list items, chips, rows)
uses a preset. If a rise or a scale is genuinely needed there, animate it with
the declarative CSS-transition style (`transitionProperty` on an `AnimatedView`
`style`, as the chip's selected-state crossfade does), not a layout animation.

## Verifying

The picker is inside a sheet that needs a connected provider, so it was
reproduced through a throwaway `src/app/tag-probe.tsx` route (seeded with
`recordRecentTags`, deleted after) driven headlessly per
`web-headless-smoke-test-playwright.md`. The assertion that catches it:

```js
[...row.children].filter((c) => getComputedStyle(c).position === 'absolute').length === 0
```

## Related

- `sheet-scroller-swap-render-loop.md` — the picker's height measurement, which
  this bug corrupts from the other direction.
- `web-headless-smoke-test-playwright.md` — the probe harness.
