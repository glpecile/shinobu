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

### Android (Pixel 9 Pro XL emulator) — observed 2026-07-29

- PENDING FIRST DEV-BUILD OBSERVATION (KTD-2's named risk: if unacceptable,
  the fallback is a single `lib/toast/index.android.ts` sibling — one
  hand-written split, still strictly better than `sonner-native`'s two).

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
