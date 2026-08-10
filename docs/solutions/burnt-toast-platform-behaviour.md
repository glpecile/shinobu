# burnt toast: what it actually rendered per platform — and why it was replaced

Plan 0032 KTD-2 named a risk: `burnt`'s iOS and web paths are its showcase,
its Android rendering the least demonstrated. This file records what was
observed per platform, and the outcome.

## Resolution (owner decision, 2026-08-03)

**burnt is gone.** Android toasts were finally observed on device: they render
but look bad — and inspection of the installed package showed why nothing in
burnt could improve them. burnt's entire Android implementation is a 15-line
`ToastAndroid` shim (`build/BurntModule.android.js`): it shows **`title` only
(the `message` argument is silently dropped)**, ignores `preset` (no
icon/color), and since API 30 the OS ignores gravity and forbids custom toast
views. Its Android "native module" is the untouched Expo hello-world template,
and burnt hadn't shipped a release in ~17 months.

Rather than the one-file `index.android.ts` fallback this doc originally
proposed, the owner chose **sonner-native on both iOS and Android, web sonner
on web** — one library family, one look on 2 of 3 targets, and the same
`toast.success(title, { description, duration })` call shape on all three, so
the wrapper (`src/lib/toast/index.ts`) stays a single implementation. The only
platform split is the library binding (`src/lib/toast/sonner.ts` /
`sonner.web.ts`). This supersedes the 2026-07-28 burnt-over-sonner-native
decision in `todos/015` — the axis that decision was made on ("never a
hand-maintained web split") is preserved: the split is a two-line re-export,
and web keeps the exact sonner it always rendered through.

## The wrapper's contract (unchanged)

- `toast.success(title, message?)` → 2 s; `toast.error(title, message?)` → 3.5 s.
- The haptic fires from `@/lib/haptics` inside the wrapper, never delegated to
  the toast library (R10) — covers Android, no double-fire on iOS.
- Toasts stay announcement-only (plan 0032 R7): sonner-native *supports*
  actions/press handlers; we deliberately never pass one. Recourse (a
  `providerItemUrl` link, a failed provider) lives on the sheet that stays
  open, never a toast.
- Both platforms need `<ToastHost />` mounted in `app/_layout.tsx` — without a
  `<Toaster />` the calls silently no-op (web always worked this way; native
  now does too, unlike burnt which rendered hostless from native code).

## Gotchas worth keeping

- `duration` is now **milliseconds** (sonner's unit) — burnt used seconds; the
  conversion lives in `src/lib/toast/options.ts` and nowhere else.
- sonner-native peer-deps `react-native-svg` (new native dep at adoption) —
  adding/upgrading needs `bun ios.clean` / `bun android.clean` (AGENTS.md §
  CNG). Its dismiss gestures need `GestureHandlerRootView` (already at root)
  and it sits under expo-router's `SafeAreaProvider`.
- Historical (burnt 0.13.0, observed 2026-07-29): iOS SPIndicator capsule
  rendered great and above native sheets; that bar is the reference for what
  sonner-native must match on iOS.

## Post-swap verification (2026-08-03, dev clients rebuilt on both platforms)

- **iOS** (iPhone 17 Pro sim): success and error toasts render the themed
  capsule (icon + title + description) over the dark UI; the real wrapper
  path (`toast.error(title, message)`) verified in the running app.
- **Android** (Pixel 9 Pro XL emulator, API 36): same surface, same styling —
  including the description line burnt's `ToastAndroid` shim silently
  dropped. The app also renders fine on this emulator now, closing the
  original "never observed on Android" gap entirely.
- Metro resolves the platform binding correctly on device:
  `lib/toast/sonner.ts` (sonner-native) loads on both native platforms.
- Gotcha hit during the swap: a Metro started before `bun remove burnt` can
  serve a stale graph that still imports `burnt` and red-screens with
  "burnt could not be found". Restart Metro with `--clear` after removing a
  dependency.
