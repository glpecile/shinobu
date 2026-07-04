# `bun ios` failed at `pod install` after adding an Expo package

**Symptom:** `bun ios` (i.e. `expo run:ios`) failed with "Something went wrong
running `pod install` in the `ios` directory." Running `pod install` manually
showed the real error:

```
[!] CocoaPods could not find compatible versions for pod "ExpoModulesWorklets":
It seems like you've changed the version of the dependency `ExpoModulesWorklets`
and it differs from the version stored in `Pods/Local Podspecs`.
You should run `pod update ExpoModulesWorklets --no-repo-update` ...
```

**Cause:** `bunx expo install expo-splash-screen` bumped `expo-modules-core` in
`node_modules`, but the generated `ios/` directory (with its `Podfile.lock` and
`Pods/Local Podspecs` snapshots) still described the pre-upgrade versions. Any
dependency change that touches native code can desync the generated native
project this way.

**Fix (don't play whack-a-mole):** running the suggested
`pod update ExpoModulesWorklets --no-repo-update` just surfaces the next stale
pod (`ExpoModulesCore`, then more). Since `ios/` is CNG-generated and gitignored
(see `AGENTS.md` "Continuous Native Generation"), the correct fix is to
regenerate it wholesale:

```sh
bun ios.clean   # expo prebuild --platform ios --clean (regens ios/, runs pod install)
bun ios         # build + run as usual
```

**Rule going forward:** after adding/removing/upgrading any dependency that
ships native code, or changing `app.json`/config plugins, do a clean prebuild
(`bun ios.clean` / `bun android.clean`) before building — never `pod update`
individual pods or hand-edit anything under `ios/`.
