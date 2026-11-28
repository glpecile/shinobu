# Android press ripple is a rectangle behind rounded things

**Symptom.** On Android every pressable painted a grey **rectangle** of
highlight while pressed — behind the pill-shaped tag chips in the log sheet,
spilling past the rounded corners of the `Season 1` card on a detail screen,
and spanning the full width of a Diary day header. iOS and web showed nothing
of the sort.

**Cause.** `PresstableOpacity` / `PresstableScale` (`components/presstable`)
wrap pressto, and pressto renders gesture-handler's button: on Android a native
`ButtonViewGroup` that can draw the platform ripple. gesture-handler 3 draws the
ripple in `dispatchDraw`, clipped to the **button's own** padding box:

```kotlin
// RNGestureHandlerButtonViewManager.kt
selectableDrawable?.let {
  canvas.save()
  BackgroundStyleApplicator.clipToPaddingBox(this, canvas)
  it.draw(canvas)
```

That box follows the button's `borderRadius`, which defaults to `0`. Every
rounded surface in this app draws its shape on a `View` **inside** the
pressable, so the ripple stayed rectangular.

**Fix.** No ripple by default. pressto 0.8 renders gesture-handler 3's
`Touchable`, which sends `rippleColor: 'transparent'` unless it gets
`androidRipple`. pressto sets `androidRipple` only when a caller passes
`rippleColor`, so the wrapper needs no default. For `transparent`,
`createSelectableDrawable()` returns `null` and draws nothing. Before 0.8 the
wrapper passed `rippleColor="transparent"` itself, because `undefined` resolved
`colorControlHighlight` from the theme.

Press feedback is then pressto's own opacity dim and scale, which are the shape
of the content by construction and identical on iOS and web. The ripples the
app _does_ ask for are the tab bar's (`app/(tabs)/_layout.tsx`), which is
NativeTabs, not pressto, and `components/fab`'s `rippleColor`.

**Generalise.** Any Android pressable whose visible shape is drawn by a _child_
shows this. Repeating the radius on the pressable also fixes one instance —
but if the ripple isn't part of the design, deleting it beats reshaping it.

**Watch out.** Fast Refresh proves nothing here: a dev client that has lost its
Metro connection keeps serving the old bundle and every UI change looks like it
had no effect. `curl -s localhost:8081/json/list` returning `[]` is the tell —
relaunch through
`shinobu://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`
before concluding a fix didn't work.

**Keyboard focus.** A button with no ripple has no drawable for
`state_focused`, so Android draws its default focus highlight. That highlight is
a rectangle over the view's bounds, whatever radius the view has. `components/fab`
keeps a ripple for this reason: a `RippleDrawable` draws its own focused state,
clipped to the pressable's border radius, so a Tab-focused FAB follows its rounded-square shape.
