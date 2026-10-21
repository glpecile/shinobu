# Expo SDK 58

Upgrade from SDK 57 to the stable SDK 58 release and use Expo's supported package versions. Remove the SDK 57 screens override, add the Android native-tab icon peer, and migrate affected React Native ref types and Router imports. Keep generated native directories untracked.

Validation includes Expo Doctor, repository checks, the existing test suite, a static web export, and clean native development builds. Use existing simulator provider sessions to check connections, movie and TV logging, and list creation. Record actual coverage and any authentication or provider blockers; do not substitute mocked writes for live-flow verification.

## Draft checkpoint — 2026-10-20

Implemented the SDK 58 dependency migration, removed the screens override, and
updated Router imports and RN 0.88 instance types. Clean native builds succeeded
on iOS and Android. Nitro WebView needs the pinned upstream RN 0.88 migration
commit until its next release; see
`docs/solutions/nitro-webview-rn-088-props-initialization.md`.

Validation at this checkpoint:

- Expo Doctor: 20/20 checks passed, with no new exclusions.
- Typecheck and lint passed (existing lint warnings remain).
- `bun run test`: 1500 passed, 0 failed across 151 files.
- Classname, router-push, external-link checks and `git diff --check` passed.
- `bun run build:web` passed after fixing server-side MMKV reads and bundled
  TMDB-token handling. Regression tests cover the storage/token boundaries.
  The export log is machine-local at `/tmp/shinobu-sdk58-web-handoff.log`.

Live QA:

- iOS SDK 58 app launches with connected providers and the hidden Letterboxd
  write WebView mounted.
- Letterboxd and Serializd disconnect/reconnect succeeded using existing WebView
  sessions; both are connected again. No passwords were entered.
- AniList and Simkl existing sessions remain connected; fresh connection flows
  were not exercised. Trakt is excluded at the user's request.
- Android debug build passed. Pixel_9 recovered from an unresponsive old emulator
  and booted without wiping data; the rebuilt APK and runtime flows still need QA.
- Movie logging, TV logging, and list creation have not been exercised on either
  platform. No media logs or lists were created by this QA checkpoint.

This is a draft checkpoint, not release approval. Complete the remaining live flows and review before marking the PR ready. Native dependency
changes require `bun ios.clean` / `bun android.clean` for other checkouts; later
source-only fixes hot reload.
