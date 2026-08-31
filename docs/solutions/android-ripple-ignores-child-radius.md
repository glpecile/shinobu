# Android press ripple is a rectangle behind a pill

**Symptom.** Pressing a tag chip in the log sheet on Android painted a
grey rounded-*rectangle* behind the chip — wider and taller than the pill it
was giving feedback for. iOS and web showed nothing of the sort.

**Cause.** `PresstableOpacity` (`components/presstable`) wraps pressto, and
pressto renders RNGH's `BaseButton` — on Android a native `ButtonViewGroup`
that carries the platform's `selectableItemBackground` ripple. That ripple is
masked by the **button's own** border radius, which defaults to `0`:

```kotlin
// RNGestureHandlerButtonViewManager.kt
if (hasBorderRadii && selectable is RippleDrawable) {
  val mask = PaintDrawable(Color.WHITE)
  mask.setCornerRadii(buildBorderRadii())
  selectable.setDrawableByLayerId(android.R.id.mask, mask)
}
```

`hasBorderRadii` reads `borderRadius` and the four per-corner props, which RN
fills in from the button's *style*. `TagChip` put `rounded-full` on the `View`
**inside** the pressable, so the button itself had no radius and its ripple
mask stayed a rectangle.

**Fix.** Put the radius on the pressable as well as on the box it wraps:

```tsx
<PresstableOpacity className="rounded-full" …>
  <View className="… rounded-full px-4 py-2">
```

Masked to the pill, the ripple then sits under the chip's own opaque
`bg-surface` layer and stops being visible at all — the press reads as
pressto's opacity dim, measured at ~21% darker, which is the chip's shape by
construction and the same feedback every other pressable in the app gives.

**Generalise.** Any pressable whose visible shape is drawn by a *child* rather
than by the pressable will show this on Android. If a rectangle of highlight
appears around a rounded thing, the radius is on the wrong element — move or
duplicate it onto the `Presstable*`.

**Watch out.** Fast Refresh proves nothing here: a dev client that has lost its
Metro connection keeps serving the old bundle and every UI change looks like it
had no effect. `curl -s localhost:8081/json/list` returning `[]` is the tell —
relaunch through `shinobu://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`
before concluding a fix didn't work.
