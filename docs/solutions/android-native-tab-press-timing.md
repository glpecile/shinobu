# Android's native tab bar: `tabPress` timing and the keyboard bounce

Two facts about `NativeTabs.Trigger`'s `tabPress` on Android, both found while
adding double-tap-to-refresh (2026-08-18). Both apply to any future tab-press
gesture.

## 1. `tabPress` reaches JS much later than the finger lands

Detecting a double tap by comparing two `tabPress` timestamps measures the gap
between the two **JS callbacks**, not between the two touches — and the native
bar adds its own delivery lag on top, unevenly. Measured on the Pixel 9 Pro XL
emulator, injecting taps 204ms apart:

| taps injected apart | `tabPress` callbacks apart |
| ------------------- | -------------------------- |
| 204ms               | 413ms                      |
| 204ms               | 445ms                      |
| 204ms               | 10ms (coalesced)           |

A window sized off the platform's ~300ms double-tap timeout therefore drops
real double taps. `TAB_DOUBLE_TAP_MS` (`lib/navigation/tab-double-tap.ts`) is
600ms for this reason — err wide, because a tab press has no delayed action
being held back and the worst case is one extra refresh.

## 2. Re-tapping the search tab bounced the keyboard

`app/(tabs)/search.tsx` blurs the field before re-focusing it, because Android
keeps a `TextInput` *focused* after the keyboard is dismissed (back gesture,
scroll-away) and `.focus()` on an already-focused input is a no-op. But
`tabPress` fires on every tap of the search tab, so the steady state after any
tap — focused, keyboard up — hit that same blur: the keyboard slid out and back
in, reading as "the keyboard comes up twice" on a double tap.

`Keyboard.isVisible()` (react-native core) separates the two states exactly:

```ts
if (process.env.EXPO_OS === 'android' && field.isFocused()) {
  if (Keyboard.isVisible()) return; // already where the request wants it
  field.blur();                     // focused but dismissed — force a transition
}
```

`field.isFocused()` alone cannot tell them apart, which is why the original
guard could not have been narrower.
