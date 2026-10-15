# Android development launcher and Metro addresses

Pixel_9 runs Android 16 / API 36. When investigating “does not open” on
2026-10-14, launching `xyz.glpecile.shinobu` opened Expo's development launcher,
not a fresh crash. Its recently opened server used an earlier LAN address.
The host Metro answered `/status`, and `adb reverse --list` already contained
`tcp:8081 tcp:8081`.

Opening this URL through the device tooling reached Shinobu's restored sign-in
screen without reinstalling or clearing app data:

```text
exp+shinobu://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081
```

Use the running project's Metro port and restore `adb reverse` after emulator
restarts. An older entry under “Recently opened” is not proof the current Metro
is reachable. The device model does not determine its Android system version;
switching Pixel profiles is not a remedy for a stale server address.

The crash buffer also contained an earlier `ShadowTree::commit` assertion in
React Native/Reanimated after 2,774 seconds of process uptime. That is separate
from reaching the dev launcher and remains unresolved; see
`todos/021-pending-p1-android-shadow-tree-abort.md`. No login or provider-write
actions were performed during the startup check.
