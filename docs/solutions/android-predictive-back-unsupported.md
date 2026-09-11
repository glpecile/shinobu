# Predictive back doesn't work, and `predictiveBackGestureEnabled: true` breaks back on Android 13–15

**Symptom:** `app.json` had `android.predictiveBackGestureEnabled: true`, but no
predictive back animation ever appeared — not back-to-home, not between screens.

**Cause — two independent blockers, neither fixable from app code:**

1. **React Native claims the gesture with a non-animation callback.** On
   targetSdk 36 `Activity.onBackPressed()` is no longer called, so RN's
   `ReactActivity` registers an always-enabled `OnBackPressedCallback` that
   implements only `handleOnBackPressed()`. An enabled callback without
   `handleOnBackStarted/Progressed/Cancelled` tells Android the app owns the
   gesture, so the system draws nothing. Still true on RN main (0.89-nightly).

2. **react-native-screens has no predictive back at all.** Zero occurrences of
   `handleOnBackProgressed` / `OnBackAnimationCallback` in 4.26, 4.28-nightly or
   5.0.0-alpha.2. Fragment-level predictive back needs `FragmentManager`'s back
   stack, which rules out the synchronous fragment commits the library depends on
   ([discussion #2540](https://github.com/software-mansion/react-native-screens/discussions/2540)).

Expo Router changes nothing here: its vendored navigation handles back purely in
JS (`build/fork/useBackButton` → RN `BackHandler` → `navigation.goBack()`) and
its Android module never touches the back dispatcher.

Verified on a Pixel 9 / API 36 emulator with `log.tag.CoreBackPreview VERBOSE`:
the app registers `mIsAnimationCallback=true` (androidx's proxy) but the topmost
enabled callback is RN's plain one. Mid-gesture screenshots show Settings
scaling into a card while Shinobu doesn't move a pixel.

**The flag was worse than useless.** On Android 16 it's ignored — targetSdk 36
enforces predictive back regardless. On Android 13–15 it *is* honoured, and
there RN's callback is never registered (its gate is `SDK_INT >= 36 && targetSdk
>= 36`), so the back dispatcher is empty, the OS default fires, and **back exits
the app from any screen** instead of popping the stack.

Reproduced by pinning `targetSdkVersion: 35` via `expo-build-properties`, which
puts RN on the same branch a real Android 13–15 device takes. Same build, one
flag flipped: `true` → back from a detail screen landed on the launcher;
`false` → back popped to Home.

**Fix:** `predictiveBackGestureEnabled: false` in `app.json`.

**Revisit when** react-native-screens ships predictive back (v5+) *and* RN makes
`ReactActivity`'s callback an `OnBackAnimationCallback`. Both are needed; the
flag alone does nothing.
