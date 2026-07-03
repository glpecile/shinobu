# `bun ios`/`bun android` opened Expo Go and failed with HTTP 500

**Symptom:** Running `bun ios` launched the iOS Simulator but showed "There was a
problem running the requested project. HTTP response error 500:
`{"error":"UnexpectedServerData: Unexpected server error: No returned query result"}`".

**Cause:** `package.json`'s `ios`/`android` scripts were `expo start --ios` /
`expo start --android`. Those only start the Metro dev server and open whatever's
already installed on the simulator/device — with no custom dev client built yet, that
means plain **Expo Go**. This project links native Nitro modules
(`react-native-mmkv`, `react-native-nitro-fetch`, `react-native-nitro-modules`) that
Expo Go doesn't ship, so it can't run the project at all (see `AGENTS.md` "Nitro
Modules" tradeoff and "Continuous Native Generation").

**Fix:** Scripts must use `expo run:ios` / `expo run:android` instead. Those trigger
Continuous Native Generation automatically — `expo prebuild` runs if `ios/`/`android/`
don't exist yet, then the native project is built and a custom dev client is
installed on the simulator/device, replacing Expo Go for this project.

```diff
   "scripts": {
     "start": "expo start",
-    "android": "expo start --android",
-    "ios": "expo start --ios",
+    "android": "expo run:android",
+    "ios": "expo run:ios",
     "web": "expo start --web"
   },
```

**Rule going forward:** the moment any native module is linked, `expo start --ios`/
`--android` stop being viable entry points for native platforms — always wire
`expo run:ios`/`expo run:android` (or an EAS dev-client build) instead. `expo start
--web` is unaffected since nitro-fetch/mmkv both degrade to web-compatible
implementations there.
