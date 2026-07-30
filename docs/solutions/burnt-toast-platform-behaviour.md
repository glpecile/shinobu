# burnt toast: what it actually renders per platform

Plan 0032 KTD-2 named a risk: `burnt`'s iOS and web paths are its showcase,
its Android rendering the least demonstrated. This file records what the
wrapper (`src/lib/toast.ts`) actually produces, per platform, as observed on
dev builds — so the "one implementation across platforms" claim rests on a
recorded fact rather than a README.

## The wrapper's contract

- `toast.success(title, message?)` → `preset: 'done'`, 2 s.
- `toast.error(title, message?)` → `preset: 'error'`, 3.5 s.
- The haptic fires from `@/lib/haptics` inside the wrapper, **not** via
  burnt's `haptic` option — that option is iOS-only (SPIndicator), so
  delegating to it would silently drop the Android buzz. `haptic: 'none'` is
  asserted in `src/lib/toast/options.test.ts`.

## Observations (burnt 0.13.0, Expo SDK 57)

### iOS (iPhone 17 Pro simulator, iOS 26.5) — observed 2026-07-29

- `toast.success('Added to reading list', 'AniList')` renders the
  SPIndicator-style capsule banner at the top: blue check icon, bold title,
  muted message line beneath, drag-dismissable, auto-dismissed ≈2 s. Legible
  over the dark theme, does not obscure the tab bar or the sheet area.
- It renders **above native sheets**: fired while the card-actions sheet was
  mid-close, it stayed visible through the close animation.
- Verified in the real flow (watchlist picker, clean report): one toast, one
  haptic, sheet closed — no inline success line anywhere.

### Android (Pixel 9 Pro XL emulator, API 36) — **NOT YET OBSERVED**

**KTD-2's named risk stays open.** `bun android.clean` builds and installs
fine (BUILD SUCCESSFUL, 5m18s) and Metro bundles for Android
(3318 modules), but the app could not be driven to a rendered screen on this
host:

- The dev client loads the bundle and Hermes runs it — logcat shows
  `Running "main" with {"fabric":true}` and `✅ JSI interop was installed` —
  yet the RN root renders **nothing** (only the dev-launcher Tools button in
  the view tree). `app/_layout.tsx` returns `null` until `useFonts` resolves,
  which is the gate it is sitting behind.
- No JS error, no red box, and **no `burnt` log line anywhere** in logcat, so
  nothing here implicates the toast wrapper — the identical bundle renders and
  toasts correctly on iOS.
- The emulator was also ANR-ing system apps of its own
  (`ANR in com.google.android.googlequicksearchbox`, repeated
  "failed to complete startup"), i.e. host memory starvation while an iOS
  simulator, a native build and Metro shared the machine. Re-booting the AVD
  with `-memory 6144` fixed the ANRs but not the blank root.

So: **the Android toast is still unverified, and this is the fallback trigger
to watch.** If it turns out unacceptable, the fix is one
`lib/toast/index.android.ts` sibling — a single hand-written split, still
strictly better than `sonner-native`'s two, and the wrapper is what makes it a
one-file change. Re-check on a real device or a less contended host, and
replace this section with what you see.

### Web

- Renders through sonner; requires `<ToastHost />` (mounted in
  `app/_layout.tsx`) or `Burnt.toast()` is a silent no-op. Themed via
  `useColorScheme` — sonner defaults to light and would draw a white toast
  over the dark UI.

## Gotchas worth keeping

- `duration` is **seconds**, not milliseconds — a `2000` reads as ~33 minutes.
- `burnt` ships native code: adding/upgrading it needs `bun ios.clean` /
  `bun android.clean` (AGENTS.md § CNG).
- Android's renderer is a system `Toast`: `message` visibility and theming are
  OS-controlled, and nothing is tappable anywhere — which is fine *by design*
  here (plan 0032 R7: nothing that needs a tap lives in a toast).
