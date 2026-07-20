# Web boot flash of unstyled content (FOUC)

**Fixed 2026-07-20.** On web only, booting the app showed a persistent,
reliably-reproducible flash before the real dark-themed landing screen
appeared: a light gray background with plain black unstyled text, no icons,
no layout. Native (iOS/Android) never showed this — native has a real OS
splash screen bridging the gap.

## Two root causes, not one

The first pass at this fix (inlining critical `html, body` background CSS in
`+html.tsx`) was necessary but not sufficient — deploying it changed nothing
visible. Driving the live deployment with Playwright (Chromium + WebKit),
with the external stylesheet artificially delayed via `page.route()`, proved
why: there are two independent things painting the wrong thing before the
app is ready, and only one of them has anything to do with CSS load timing.

1. **React Navigation paints its own default background as an inline
   style, completely independent of Uniwind/CSS.** `_layout.tsx`'s
   `<Stack>` never supplied a `theme`/`contentStyle`, so the screen
   container always used the vendored
   `expo-router/build/react-navigation/native/theming/DefaultTheme.js`
   background — `rgb(242, 242, 242)` — regardless of the OS being in dark
   mode. This is a literal `style="background-color:rgba(242,242,242,1)"`
   attribute baked into the static-exported HTML at build time, so it's
   there from the very first byte and cannot be fixed by any amount of
   external-stylesheet-loading-order work. **This is what was actually
   visible in the reported screenshots** — confirmed by grepping the
   vendored `DefaultTheme.js` for the exact RGB triple and matching it
   pixel-for-pixel against a Playwright screenshot taken mid-boot.
2. **Every Tailwind/Uniwind utility class (`bg-background`,
   `text-foreground`, layout, spacing) is inert until the one external
   compiled stylesheet loads**, same as before — this is a real but
   secondary contributor once (1) is fixed.

`expo-splash-screen` remains a complete no-op on web (verified: `build/SplashScreen.js`'s
`preventAutoHideAsync`/`hide`/`hideAsync` all resolve immediately and do
nothing — `app.json`'s splash `backgroundColor`/`dark.backgroundColor` only
generate native iOS/Android assets), so there was nothing else bridging the
gap.

## Fix

Three layered pieces, all in this branch:

1. **`_layout.tsx`: theme the `<Stack>` explicitly.**
   `contentStyle: { backgroundColor }`, computed from `useColorScheme()`
   and matching `--color-background` in `global.css`
   (`#0a0a0a` dark / `#ffffff` light). Removes root cause (1) — React
   Navigation now paints the correct background from the first static byte,
   on every platform, not just web.

2. **`src/app/+html.tsx`: a static `#boot-loader` overlay.** A full-viewport
   `position: fixed` `<div>` (dark background, Shinobu's 忍 kanji + wordmark,
   system font stack so it has no font to wait on) rendered as a plain
   sibling of `#root` in the static HTML — outside the React tree entirely,
   so hydration can never touch it. It covers *everything* — both root
   causes — for the entire boot window, then `_layout.tsx` removes it
   (`document.getElementById("boot-loader")?.remove()`) in the same
   `useEffect` that already fires once `fontsLoaded` is true. A `setTimeout`
   safety net in the same inline `<script>` force-removes it after 4s
   regardless, so a font-load error can never leave a user stuck on a
   black screen — that failure mode would be strictly worse than the
   original bug.

   Fixed dark background here (not theme-reactive): dark is Shinobu's
   primary/designed-for mode (AGENTS.md), and this exists specifically to
   avoid a background-color race — a hardcoded value can't lose that race.

3. **`+html.tsx`: inline `html, body` critical CSS** (background + text
   color matched, so any stray unstyled text is invisible rather than a
   flash of plain black copy) as defense-in-depth, in case the boot loader
   is ever removed before the external stylesheet finishes (fonts and CSS
   are independent async loads with no ordering guarantee between them).

Colors are hardcoded in both (2) and (3) — not `var(--color-background)` —
because that custom property lives in the same external stylesheet that
hasn't necessarily loaded yet. Must be kept in sync by hand with
`--color-background` in `src/global.css`.

## Verification

Reproduced the bug and then the fix with Playwright (Chromium + WebKit)
against the live EAS Hosting deployment, artificially delaying both the CSS
and JS bundle responses via `page.route()` to widen the observation window:

- **Before the `contentStyle` fix**: screenshot at 300ms into boot was a
  pixel-match for the reported bug (gray `rgb(242,242,242)` background,
  unstyled black text) even with the `+html.tsx` critical-CSS mask already
  deployed — proving the mask alone doesn't touch the React Navigation
  layer sitting on top of it.
- **After all three pieces**: screenshot at 300ms shows the dark boot
  loader (kanji + wordmark) in both engines; the loader is removed and the
  fully-styled page is in place well before any unstyled/gray state could
  ever be observed.
- **Real-world timing** (no artificial delay, live deployment): boot loader
  removed in 728ms (Chromium) / 836ms (WebKit).

```sh
bunx expo export --platform web
grep -o 'id="boot-loader"' dist/index.html   # confirm it's baked into the static export
npx eas-cli@latest deploy                     # preview; --prod once satisfied
```
