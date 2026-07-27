# A control that can only appear after a measurement must reserve its row up front

**Added 2026-07-27.** The log sheet jumped a beat after opening: the tag chips
painted, then ~34px later the "Show more" row appeared and shoved the confirm
button — and, on web, the whole vertically-centred sheet — down under a cursor
already on its way to it.

## Cause

The toggle can't be rendered on the sheet's first frame. It waits on two things
in sequence: the Letterboxd tag query resolving, and then an `onLayout` of the
chips that query returned, since "does this wrap past one row" is only knowable
after the row has been laid out. Mounting it when that answer arrives means
mounting it two async hops after the surface it lives on is already on screen.

Fading it in doesn't help. The shift is the *mount*, not the appearance — a
fade just makes a moving button look intentional.

## Fix

Keep the row mounted from the first frame and animate only its opacity:

```tsx
<AnimatedView
  aria-hidden={!(measured && overflows)}
  pointerEvents={measured && overflows ? 'auto' : 'none'}
  style={{
    opacity: measured && overflows ? 1 : 0,
    transitionProperty: 'opacity',
    transitionDuration: reduceMotion ? 0 : DURATION.swap,
    transitionTimingFunction: EASE_OUT,
  }}
>
```

**Reserve with the real element, not a constant.** A `TOGGLE_ROW_HEIGHT = 34`
would drift the moment `text-xs` or `py-1` changed — on the one row whose entire
job is to not move. The mounted row measures itself.

**Hidden has to mean gone.** Opacity alone leaves a tappable, focusable,
screen-reader-visible target sitting under the chips; `pointerEvents="none"` and
`aria-hidden` are part of the fix, not polish on top of it.

The cost is an empty ~34px band under a picker whose whole vocabulary fits on
one line. That band is invisible; the shove was not.

## Rule

If a control's *existence* depends on an async answer — a query, a measurement,
a permission check — decide up front whether its space is reserved or its
absence is load-bearing. Reserve when the surface around it is already
interactive. Only let it mount late when it appears above the fold of
attention, where nothing the user is aiming at can move.

## Verifying

`pickerHeight` and the CTA's `top` must be byte-identical in both states. Driven
headlessly per `web-headless-smoke-test-playwright.md` through a throwaway
`src/app/tag-probe.tsx` route, at one viewport narrow enough to overflow (toggle
visible) and one wide enough to fit (toggle hidden):

```
narrow (overflows): {"pickerHeight":76,"ctaTop":169,"toggleOpacity":"1"}
wide   (fits)     : {"pickerHeight":76,"ctaTop":169,"toggleOpacity":"0"}
```

## Related

- `sheet-scroller-swap-render-loop.md` — the measurement the toggle waits on.
- `reanimated-web-keyframe-pins-position.md` — the other way this row's layout
  broke, from the animation side.
