# A border on a pressto pressable is invisible on Android

**Symptom (2026-07-26).** Every outlined button on the Manage Trackers screen —
four "Disconnect"s, "Send test notification", "Show" — rendered on Android as
**bare text**: no border, no box. The same components on web drew their borders
correctly, and the *filled* buttons (`bg-accent`) were fine on both platforms.

```tsx
// Looks right on web, draws no border on Android:
<PresstableOpacity className="border border-border px-4 py-2 rounded-md">
  <Text>Disconnect</Text>
</PresstableOpacity>
```

**This was not a uniwind/className problem.** The usual native suspect — a raw
third-party component silently dropping `className`
(`uniwind-classname-third-party-components.md`) — doesn't apply: `PresstableOpacity`
*is* the withUniwind wrapper, and the same class string's `padding`,
`borderRadius` and `backgroundColor` all landed. Only the border vanished.

**Cause.** pressto renders RNGH's `BaseButton`, which on Android is a native
`RNGestureHandlerButton` that installs its own background drawable (for the
ripple). React Native draws a view's border *as part of its background
drawable* — so once the native button supplies one, `borderWidth`/`borderColor`
have nothing to draw into. `backgroundColor` survives because it is applied
separately, which is exactly why a filled button looked fine and an outlined one
looked like unstyled text.

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

**Scope.** Anything bordered *and* pressable is suspect on Android. Buttons are
handled by the primitive; the remaining hand-rolled cases (e.g. the log sheet's
provider-picker rows, which use `border border-border` directly on a
`PresstableOpacity`) have the same bug and should move to the inner-View shape
when they're next touched.
