# Android release crashes before React Native starts

The signed v0.7.4 arm64 APK crashes immediately on fresh Android 16/API 36 and
Android 17/API 37 emulators. Logcat reports:

```text
Unable to get provider androidx.startup.InitializationProvider
Failed to create an instance of class androidx.work.impl.WorkDatabase.canonicalName
```

SDK 58 enables R8 in release builds by default. `expo-background-task` brings in
WorkManager 2.9.1 and Room 2.5.0. Their consumer rules retain the database and input
merger classes without explicitly keeping their no-argument constructors. R8
removes those constructors, which WorkManager creates through reflection during
its content-provider initialization, before application startup. `dexdump` of the
published APK confirms `WorkDatabase_Impl`, `OverwritingInputMerger`, and
`ArrayCreatingInputMerger` have no direct methods or constructors.

`app.json` adds constructor keep rules through the existing `expo-build-properties`
plugin. This preserves release optimization and dependency versions, and requires
a clean native rebuild (`bun android:clean` for development). Never edit generated
`android/` files. Cache clearing cannot restore code missing from the APK.

Expo confirmed the same dependency failure in
[expo/expo#51337](https://github.com/expo/expo/issues/51337). Its widgets fix does
not cover the installed background-task package. Remove the app rules once that
dependency ships equivalent rules or resolves fixed Room/WorkManager versions,
after verifying a minified release APK.

Regression validation must use the release variant: confirm these three classes
retain `public <init>()`, then cold-launch the APK repeatedly and check logcat.
JavaScript tests and development builds do not exercise R8.

Both published v0.7.5 APKs retain all three public no-argument constructors; their
checksums and signing certificates were verified. The local minified build got
past WorkManager into React Native on Android 17. A full post-fix UI pass remains
unverified: the Android 17 emulator's system process died, and subsequent APK
installation stalled on the Android 16 emulator. These failures are not a passing
runtime check of the published APK.
