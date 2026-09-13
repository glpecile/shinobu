# Firefox: an `<input>` in a flex row won't shrink, so its siblings leave the screen

**Found 2026-09-13** on Firefox for Android: the search field's clear (X) button
rendered *outside* the field's pill, half off the right edge of the viewport.
Chrome, Safari and both native platforms laid it out correctly.

## Symptom

`src/app/(tabs)/search.tsx` lays the field out as a row — magnifier, `TextInput`,
clear button — inside one bordered wrapper (the shape
`android-pressable-over-textinput.md` moved it to). On Firefox Android the
wrapper drew at its correct width and the X rendered past its right border,
clipped by the viewport. Measured on the bug report's screenshot: pill right
border at device x=997, X glyph at x=1067–1079 of a 1080-wide viewport.

## Root cause

Not overflow of the wrapper — the wrapper is `flex-1` over react-native-web's
`View` base style, which sets `min-width: 0`, so it got exactly the available
width. Its *children* overflowed it.

`flex-1` is `flex: 1 1 0%`, and flex items refuse to shrink below their
**automatic minimum size** (`min-width: auto`). For a form control that size is
the input's intrinsic width — for `<input>` that's the `size` attribute's
default of ~20 characters. react-native-web's `textinput$raw` base style resets
appearance, border, padding and font, but **not** `min-width`, so nothing clamps
it. Firefox honours that automatic minimum size on form controls; Blink and
WebKit clamp it away, which is why only Firefox showed it.

The clear button is the *last* child, so the overflow lands entirely on it.

## Fix

`min-w-0` on the `TextInput`:

```tsx
<TextInput className="flex-1 min-w-0 text-foreground pl-3 pr-4 py-3 font-sans outline-none" … />
```

No-op on native (`minWidth: 0` is already the effective default), and it makes
the input the item that gives up space, which is what `flex-1` meant in the
first place.

## Lesson

Any `TextInput` that is a `flex-1` item in a row with siblings needs `min-w-0`
alongside it. `flex-1` reads like "take what's left"; on a form control it means
"take what's left, but never less than twenty characters", and the sibling that
loses is the one pushed off-screen.

## Related

- `android-pressable-over-textinput.md` — why the clear button is a row sibling
  rather than an overlay, which is what exposed this.
