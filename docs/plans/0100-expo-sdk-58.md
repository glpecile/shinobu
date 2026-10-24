# Expo SDK 58

## Reconciliation, 2026-10-23

PR #289 merged on 2026-10-21. The draft checkpoint below is historical; the
second live QA pass supersedes its earlier untested-flow list. Successful
iOS movie/TV logging, iOS list creation and Android TV logging were recorded.
Still unverified there: Android list creation, the Android Letterboxd retry,
and fresh AniList/Simkl connections. The separate minified-release WorkManager
fix and its UI limits are documented in
`docs/solutions/android-release-workmanager-constructor-stripped.md`.
Merge status does not establish that those remaining runtime checks passed.

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

## Live QA checkpoint — 2026-10-20 (second pass)

Metro on 8081 with the existing simulator sessions. Logs created during QA are
real writes (Shinobu has no remove-from-history action):

- Android: the SDK 58 APK installed over the old one without losing data. Every
  launch logged `getAssetByID of undefined` from native-tab Material icons.
  Uniwind's `react-native` re-export lacks RN 0.88's `AssetRegistry`, so
  `metro.config.js` now routes expo-asset's `react-native` import to the real module
  (`docs/solutions/uniwind-rn-088-missing-asset-registry.md`). After that, Android
  launched without errors.
- iOS movie: *Paddington in Peru* was logged to Simkl and Letterboxd.
- Android movie: *Paddington 2* reached Simkl. The Letterboxd WebView write timed
  out while the emulator was overloaded (load average about 42, 2.5 GB RAM,
  `kcompactd` busy), and the failure showed a "Log on Letterboxd" link. Not
  retried. The same write works on iOS, so the emulator is the likely cause,
  not yet confirmed.
- iOS TV: *Fawlty Towers* S1E1 was logged to Serializd and Simkl.
  *Paddington* (1976) S1E1 and S1E2 were logged to Serializd. Simkl returned
  `not_found` for that series (a gap in Simkl's catalog), and the app reported it
  as skipped.
- iOS list: the private Letterboxd list "Shinobu SDK58 QA" was created.
- Web (user): logging *Vision* S01E03 worked. Renaming a list created moments
  earlier showed "Install or update the Letterboxd script" until the page was
  reloaded.
- Fonts: before the Metro fix, iOS and Android loaded no custom fonts (only
  `Ionicons`) and fell back to system type. After it, Inter and Space Grotesk
  load on both. Web was never affected.
- Android TV, after a cold reboot of the emulator: *Fawlty Towers* S1E2 went to
  Simkl and Serializd. The catch-up queue took about 2 minutes to load while
  Serializd's progress read returned 404 and retried.
- Still open: Android list creation and a Letterboxd retry on Android. The host
  Mac (16 GB, about 11 GB of swap in use) starves the 2.5 GB emulator. The dev
  build reaches about 750 MB RSS and ANRs on input, with no main-thread stack
  captured. Fresh AniList and Simkl connection flows are also still open.
