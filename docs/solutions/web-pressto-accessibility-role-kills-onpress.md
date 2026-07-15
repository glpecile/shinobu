# Web: any `accessibilityRole` other than `"button"` on a pressto pressable silently kills `onPress`

## Symptom

A `PresstableOpacity`/`PresstableScale` renders fine on web, shows its press
cursor, but `onPress` never fires. No error, no warning. Native is unaffected.
Observed on the log confirm sheet's provider toggle rows: the picker header
(role `button`) expanded fine, while the provider rows
(`accessibilityRole="checkbox"`) ignored every click, so a provider could
never be unselected.

## Root cause

pressto's pressables are built on RNGH's `BaseButton`. On web, RNGH's
`NativeViewGestureHandler` decides whether a view is a pressable **by reading
the rendered DOM `role` attribute**:

```ts
// react-native-gesture-handler/src/web/handlers/NativeViewGestureHandler.ts
this.buttonRole = view.getAttribute('role') === 'button';
...
if (this.buttonRole || isRNGHText) { /* only then handle the press */ }
```

RNGH's own `GestureHandlerButton.web.tsx` defaults to
`accessibilityRole="button"`, but any `accessibilityRole` you pass through
pressto overrides it. `role="checkbox"` (or anything else) → `buttonRole =
false` → the gesture never activates → `onPress` is dead. Only on web; native
gesture handling doesn't consult the accessibility role.

## Fix

Never set `accessibilityRole` (or `role`) to anything but `"button"` on a
pressto pressable. Express toggle/checkbox semantics via `accessibilityState`
(`{ checked }`) and `accessibilityLabel` instead, and keep the default role:

```tsx
<PresstableOpacity
  accessibilityLabel={`Log to ${label}`}
  accessibilityState={{ checked: selected }} // announced on native
  onPress={onToggle}
>
```

## How it was found

Playwright against the web bundle: instrumented `onPress` of both the working
header and the dead row, bisected the prop difference — removing
`accessibilityRole="checkbox"` immediately restored presses; re-adding
`accessibilityState` alone kept them working.
