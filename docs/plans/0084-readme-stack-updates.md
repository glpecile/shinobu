# README stack dependency refresh

## Scope

Review the installed README-listed libraries against releases on 2026-10-13.
Update Galeria to 3.1.0, Keyboard Controller to 1.22.7, and the compatible
Expo 57 and other runtime patch releases. Keep the existing image-only Galeria
API and the separate web lightbox; video galleries are not a requested feature.

Keep React, React Native, Gesture Handler, Reanimated, Worklets, Screens, and
Safe Area Context on Expo 57's coordinated versions. Keep nitro-webview 0.1.0:
0.2.1 declares React Native ~0.85.3 and Nitro Modules ^0.35.9 peers, unlike our
0.86.3 and 0.37.1. Update the README-listed oxlint and Wrangler tools too, but
leave unrelated development dependencies alone.

Keyboard Controller 1.22.7 and SVG 15.15.5 are deliberate deviations from
Expo's recommended 1.21.9 and 15.15.4. Their peer ranges allow this stack;
validate with clean native builds and smoke tests rather than suppress the
warnings from `expo install --check`.

## Relevant releases

- [Galeria 3.1.0](https://github.com/nandorojo/galeria/releases/tag/v3.1.0):
  Android Kotlin-plugin compatibility, iOS invalid-frame/data-URL fixes. Its
  new video API is additive; no migration is needed for our photo viewer.
- [Keyboard Controller 1.22.7](https://github.com/kirillzyusko/react-native-keyboard-controller/releases/tag/1.22.7):
  focus dismissal and window-offset fixes, plus the 1.22 line's lifecycle fixes.
- Expo UI 57.0.23 fixes Android numeric-width crashes, canceled presses, and
  hosted touch handling; Expo 57.0.28 updates Modules Core's hosted layout.
- Ionicons 13.1.5, Effect 4.0.4, Zod 4.6.7, SVG 15.15.5, and React Native Web
  0.21.4 retain the APIs used here.
- [oxlint 1.88.0](https://github.com/oxc-project/oxc/releases/tag/oxlint_v1.88.0)
  improves diagnostics and fixes conflicting type-import fixes.
- [Wrangler 4.150.0](https://github.com/cloudflare/workers-sdk/releases/tag/wrangler%404.150.0)
  fixes dev asset reload loops and enables source-map uploads by default.
  Validate packaging with a dry run, never deploy as part of this refresh.

## Icons

There is no recorded decision rejecting Nano Icons. The current Ionicons set
already renders font glyphs. Nano Icons primarily adds SVG-to-font generation,
custom multicolor icons, and native symbols. Keep Ionicons rather than own a
second font-generation pipeline without a custom-icon requirement. Document
the actual icon library in the README.

## Validation

- Existing lint, class-name, navigation, type, and unit checks; web export.
- Expo dependency compatibility check.
- Clean-prebuild and build for the booted iPhone 17 Pro and Pixel 9 emulator.
- On both: startup, detail navigation, poster viewer open/zoom/close, headshot
  viewer, native filmography filters, and search keyboard input. Do not change sessions
  or send provider writes during smoke testing.
- One PR with release rationale and actual validation results. Native updates
  require `bun ios.clean` / `bun android.clean`, not just hot reload.

## Results

- Lint, class-name, guarded-navigation, typecheck, and 1,415 isolated tests pass.
  oxlint now reports five non-blocking function-scoping warnings in existing
  tests; no unrelated test refactor is included.
- Web static export and Wrangler deploy dry run pass. Nothing was deployed.
- Clean iOS and Android builds succeed. Android's first install failed because
  the emulator's package service stopped answering, not because compilation
  failed. After the approved AVD reset and cold boot with software graphics,
  the same APK installed successfully.
- iPhone 17 Pro (iOS 26.5): search input/results, Heat details, fullscreen
  poster pinch/close, Al Pacino headshot open/close, and native Movies filter
  exercised. The recorded search/gallery fragment passed end-to-end replay.
  The idle warning in search was the input caret, not a pending result; the
  next step separately waited for the result. Image points are device-specific
  because the native gallery thumbnails have no labels.
- Pixel 9 (Android API 36): the same search, details, poster pinch/back,
  person/headshot open/back, and Compose Movies-filter checks exercised live.
  Android recorder hierarchy reads repeatedly timed out; its interrupted
  recording is not claimed as a regression pass or committed as a test.
- Metro's IPv6-only localhost binding initially blocked the iOS bundle. The
  verified connection fix is in `docs/solutions/metro-localhost-ipv6-dev-client.md`.
- `expo install --check` still reports the two intentional recommendations
  above. No compatibility exclusions or dependency patches were added.
- Provider writes, reconnects, real haptics, and background notification delivery
  were not tested; simulators cannot validate the latter two hardware behaviors.
