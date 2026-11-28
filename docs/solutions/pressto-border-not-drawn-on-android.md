# A border on a pressto pressable is invisible on Android

**Symptom (2026-07-26).** Every outlined button on the Manage Trackers screen —
four "Disconnect"s, "Send test notification", "Show" — rendered on Android as
**bare text**: no border, no box. The same components on web drew their borders
correctly, and the _filled_ buttons (`bg-accent`) were fine on both platforms.

```tsx
// Looks right on web, draws no border on Android:
<PresstableOpacity className="border border-border px-4 py-2 rounded-md">
  <Text>Disconnect</Text>
</PresstableOpacity>
```

**This was not a uniwind/className problem.** The usual native suspect — a raw
third-party component silently dropping `className`
(`uniwind-classname-third-party-components.md`) — doesn't apply: `PresstableOpacity`
_is_ the withUniwind wrapper, and the same class string's `padding`,
`borderRadius` and `backgroundColor` all landed. Only the border vanished.

**Cause.** pressto rendered gesture-handler 2's `BaseButton`, which on Android
is a native `RNGestureHandlerButton` that installed its own background drawable
(for the ripple). React Native draws a view's border _as part of its background
drawable_, so once the native button supplied one, `borderWidth`/`borderColor`
had nothing to draw into. `backgroundColor` survived because it was applied
separately, which is exactly why a filled button looked fine and an outlined one
looked like unstyled text.

**With pressto 0.8 and gesture-handler 3.** The button view manager now routes
`borderWidth`, `borderColor` and `backgroundColor` through
`BackgroundStyleApplicator`, and draws the ripple in `dispatchDraw` instead of
replacing the background (`RNGestureHandlerButtonViewManager.kt`). By the
source, a border on the pressable draws. Keep the inner `View` anyway: it owns
the padding and radius of the visible box, which `className` on `Button` and
`PressableCard` must not reach (`button-classname-padding-shrinks-the-label.md`),
and it clips poster corners.

**Fix.** Keep the box off the pressable: the pressable carries layout only, and
an inner plain `View` carries the border, padding and fill. `components/button`
does this once, so no call site has to know:

```tsx
<PresstableOpacity className={cn('rounded-md', className)} {...press}>
  <View className={cn('flex-row items-center justify-center rounded-md', size, variant)}>
    {children}
  </View>
</PresstableOpacity>
```

The pressable keeps `rounded-md` too, so the press ripple/opacity clips to the
same shape as the box it wraps.

## Poster corner clipping

`MediaCard` puts `rounded-lg overflow-hidden` and its border on an inner
`View`. The inner view clips the artwork and gradient; the pressable scales the
card. The gesture-handler 3 button clips its children only with
`overflow: hidden` on the pressable itself.

**Scope.** `Button`, `PressableCard` and `RoundIconButton` draw their box on the
inner `View`. The poster wall (`features/media-layout/poster-wall.tsx`) and
detail variants (`features/detail-variants/detail-variants-section.tsx`) put
`border border-hairline overflow-hidden` on the `PresstableScale` itself, which
the gesture-handler 3 button draws and clips.
