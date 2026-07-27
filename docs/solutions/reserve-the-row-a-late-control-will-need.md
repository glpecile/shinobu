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

## The other half: the picker itself arriving late

Same shift, one level up. With no recent tags *and* an empty field there are no
suggestions at all, so the picker rendered nothing — and then the whole block
(chip row + reserved toggle row) mounted when the query landed.

Reserved the same way, with a row of chip-shaped placeholders:

```tsx
// `isFetching`, not `isPending` — a disabled query (no Letterboxd session) is
// permanently "pending", and holding space for tags that are never coming is a
// dead band instead of a jump.
const loading = suggestions.length === 0 && letterboxdTags.isFetching;
if (suggestions.length === 0 && !loading) return null;
```

Two details make the placeholder actually the same height as what replaces it:

- It is built from `TagChip`'s box — same `px-4 py-2`, same `h-5` line box the
  `text-sm` label occupies — and its outline is a full-bleed `absolute inset-0`
  layer, **not** a `border` on the box. A real border adds 2px the chip doesn't
  have: measured 38px against the chip's 36px until it was moved to a layer.
- The first placeholder feeds `measureRow`, so the collapsed row's height is the
  real measured chip height from the first frame rather than
  `ESTIMATED_ROW_HEIGHT`.

Placeholders are clipped to one row like real chips: four of them wrap on a
narrow phone, and a two-row skeleton resolving into a one-row list is the same
shift by another name.

Residual, accepted: if the query returns *no* tags and there were no recents,
the block unmounts and the sheet shrinks once. That's the standard skeleton
contract, it only happens on a Letterboxd account with an empty tag vocabulary,
and the alternative is a permanent empty band for everyone.

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
