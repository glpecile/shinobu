# Android press ripple is a rectangle behind rounded things

**Symptom.** On Android every pressable painted a grey **rectangle** of
highlight while pressed — behind the pill-shaped tag chips in the log sheet,
spilling past the rounded corners of the `Season 1` card on a detail screen,
and spanning the full width of a Diary day header. iOS and web showed nothing
of the sort.

**Cause.** `PresstableOpacity` / `PresstableScale` (`components/presstable`)
wrap pressto, and pressto renders RNGH's `BaseButton` — on Android a native
`ButtonViewGroup` that carries the platform's `selectableItemBackground`
ripple. That ripple is masked by the **button's own** border radius, which
defaults to `0`:

```kotlin
// RNGestureHandlerButtonViewManager.kt
if (hasBorderRadii && selectable is RippleDrawable) {
  val mask = PaintDrawable(Color.WHITE)
  mask.setCornerRadii(buildBorderRadii())
  selectable.setDrawableByLayerId(android.R.id.mask, mask)
}
```

`hasBorderRadii` reads `borderRadius` and the four per-corner props, which RN
fills in from the button's *style*. Every rounded surface in this app draws its
shape on a `View` **inside** the pressable, so no button ever had a radius and
every mask stayed rectangular.

**Fix.** Not a `rounded-*` repeated onto 43 call sites and kept in sync with
each child's radius forever — one default in the wrapper both of them already
go through:

```tsx
// components/presstable.tsx
const RIPPLE_COLOR = 'transparent';

<UniwindPressableOpacity rippleColor={RIPPLE_COLOR} {...rest} … />
```

`transparent` and not `undefined`: RNGH's `createSelectableDrawable()` returns
`null` outright for a transparent ripple, where `undefined` means "resolve
`colorControlHighlight` from the theme". It stays overridable per pressable —
the spread comes after it.

Press feedback is then pressto's own opacity dim (measured ~21% darker) and
scale, which are the shape of the content by construction and identical on iOS
and web. The one ripple the app *does* ask for is the tab bar's
(`app/(tabs)/_layout.tsx`), which is NativeTabs, not pressto.

**Generalise.** Any Android pressable whose visible shape is drawn by a *child*
shows this. Repeating the radius on the pressable also fixes one instance —
but if the ripple isn't part of the design, deleting it beats reshaping it.

**Watch out.** Fast Refresh proves nothing here: a dev client that has lost its
Metro connection keeps serving the old bundle and every UI change looks like it
had no effect. `curl -s localhost:8081/json/list` returning `[]` is the tell —
relaunch through
`shinobu://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`
before concluding a fix didn't work.
