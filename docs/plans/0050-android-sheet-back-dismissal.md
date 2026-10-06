# Android Back dismisses sheets

Upgrade `@swmansion/react-native-bottom-sheet` from 0.16.2 to the exact
0.17.0-next.2 prerelease, which adds the Android-native `onCloseRequest` callback.
Wire it to the shared native `Sheet`'s existing `onClose` handler. Keep the
controlled `open` state, sheet presentation, and web implementation unchanged.
No BackHandler subscription, effect, navigation routes, or dependency patch.

Validate with lint and TypeScript checks. Android needs `bun android.clean`
because this adds a native event. iOS builds also need `bun ios.clean` after the
native dependency upgrade.
