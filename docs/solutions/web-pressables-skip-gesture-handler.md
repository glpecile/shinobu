# Web pressables skip gesture handler and pressto

Seen 2026-11-20. Firefox for Android felt slow when a sheet opened and when a
tab changed.

## Cause

Every `PresstableScale` and `PresstableOpacity` rendered pressto 0.7, which
renders gesture handler 3's `BaseButton`. On web, each button:

- creates, attaches, configures and drops a gesture handler in JS;
- sets the config again on every re-render, because `createNativeWrapper`
  builds a new config object each render and `useGesture` sets it from an
  effect;
- starts and stops three Reanimated mappers (`useDerivedValue` twice,
  `useAnimatedStyle`). On web they run in JS on `requestAnimationFrame`.

Upgrading pressto does not fix it: 0.8.2 stops the config churn but keeps the
mount cost and the mappers.

## Fix

`components/presstable/index.web.tsx` renders react-native-web's `Pressable`.
It keeps the props, the repeat protection and pressto's feedback values
(opacity 0.5, scale 0.96, 250 ms `ease`). Native still uses pressto.

It always renders `accessibilityRole="button"`, as pressto did. React-native-web
renders a `link` role as a `div` and skips its Enter key, so the keyboard could
not open the account card in the provider sheet.

## Measurement

Desktop Firefox (Playwright's Gecko build), production web build, 412 × 860
viewport, signed out. The script opened the Simkl sheet, closed it, and went
through Home, Diary, Search and Settings, three times.

- Gecko profiler, `nomarkerstacks`: app JS samples went from 1534 to 1224
  (−20 %).
- Main-thread busy time from a `MessageChannel` ticker, two paired runs:
  698 → 641 ms and 741 → 596 ms.
- A DevTools-hook counter saw 30 % to 45 % fewer rendered components on each
  step.

No phone measurement was made, and no signed-in screens were measured.

## Traps

- Profile Gecko with the `nomarkerstacks` feature. Without it, the profiler
  captures a stack for each DOM style write. That made `style.touchAction`
  look like 45 % of the main thread. A timed loop showed about 1 µs per write.
- pressto 0.7 passed `onBegan` and `onEnded`, which gesture handler 3's
  `BaseButton` renamed, so a held press showed no feedback on native either.
  pressto 0.8.2 renders gesture handler 3's `Touchable`, which reports press-in
  and press-out.
