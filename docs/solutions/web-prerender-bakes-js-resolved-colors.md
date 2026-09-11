# The web prerender bakes JS-resolved colors that hydration never corrects

**Fixed 2026-09-11.** Reported as "Firefox for Android thinks parts of the UI
are in light theme": the sidebar icons drew black-on-black and every page
transition faded white → black. It is not a Firefox bug. Chrome reproduces it
byte-for-byte on the same build — Firefox for Android is just where it got
noticed.

## Root cause

`app.json` sets `web.output: "static"`, so every route is prerendered to HTML
by a Node pass with **no DOM**. Two hooks the app reads colors from return
nothing there:

- `useCSSVariable` (uniwind) reads a `display: none` probe div off
  `document` — undefined during the prerender. `@react-native-vector-icons`'
  `createIconSet` then applies its own `DEFAULT_ICON_COLOR = 'black'`
  (`common/src/defaults.ts`), so `color:rgba(0,0,0,1.00)` is what ships in the
  HTML.
- `useColorScheme` (react-native-web `Appearance`) reads
  `window.matchMedia` — `null` during the prerender, so `_layout.tsx` resolved
  the **light** branch and baked `#ffffff` into the `Stack`'s `contentStyle`,
  with React Navigation's `DefaultTheme` `rgb(242,242,242)` on the container
  behind it.

**React does not patch a hydrated element's inline `style`.** The client
render computes the right color, sees no change against what *it* rendered,
and never writes the attribute — so the prerendered value survives for the
whole of a visitor's first page. Client-side navigations mount fresh nodes and
look correct, which is why the app seemed fine until you reloaded.

That also explains the fade: `contentStyle` carries both the background *and*
the page-enter keyframes, so the screen container is the thing whose opacity
animates, and React Navigation's light theme background is what showed through
underneath it. White → black, every navigation.

## Fix

Stop resolving these colors in JS on web and hand the browser the custom
property instead. `react-native-web` forwards a `var()` color untouched —
`modules/isWebColor` passes `currentColor`, `inherit` and anything starting
`var(` straight through to the DOM — so `color: 'var(--color-muted)'` is
resolved by the cascade from `global.css`, is correct in both themes, and has
no value for the prerender to get wrong.

- `components/app-shell/index.web.tsx`: dropped the `useCssColor` helper; the
  rail's glyphs and the collapse toggle take `var(--color-*)` literals. The
  rail is the worst case for this bug because it never remounts.
- `app/_layout.tsx`: `backgroundColor` and the `ThemeProvider` theme's
  `colors.background` are `var(--color-background)` on web (native keeps the
  resolved hex — RN has no custom properties).
- `app/+html.tsx`: declared `color-scheme: light dark` on `html`. Without it
  the document is `normal`, i.e. light, so the browser paints its **own**
  surfaces light however dark the page is — overscroll, scrollbars, form
  controls, and the canvas Firefox for Android shows around the viewport
  mid-transition.

## Verification

`bun run build:web`, then grep the export — the fix is visible in the static
HTML, which is the artifact that was wrong:

```sh
bun run build:web
python3 -m http.server 8099 --directory dist
grep -o 'font-size:22px;color:[^"]*' dist/index.html   # var(--color-accent) / var(--color-muted)
grep -o 'background-color:[^";]*' dist/index.html      # no rgba(255,255,255) / rgba(242,242,242)
```

Driven with playwright-core against `dist` in **Firefox and Chrome × dark and
light** (see `web-headless-smoke-test-playwright.md`; Playwright's own Firefox
build is needed, `npx playwright install firefox`). Before: glyphs
`rgb(0,0,0)` in all four. After: `rgb(220,38,38)` active / `rgb(170,170,170)`
dark / `rgb(102,102,102)` light, in all four.

## Still exposed

~45 files still call `useCSSVariable` directly for an icon color
(`features/show-seasons/season-accordion.tsx`, `app/details/[id].tsx`,
`features/write-sheet/*`, …). They hit the same prerender miss, but only on
whichever route a visitor loads *first*, and they self-correct on the next
navigation — unlike the rail, which never remounts. The durable fix is one
platform-split `useThemeColor` wrapper in `@/lib` (web returns `var(--token)`,
native delegates to `useCSSVariable`) plus an oxlint ban on importing
`useCSSVariable` from `uniwind` directly, per AGENTS.md's wrapper rule.
