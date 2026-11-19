# React hydration error #418 on the web build

Seen 2026-11-19 on production: `/search`, `/diary`, `/settings` and every
dynamic route (`/details/...`, `/person/...`, `/studio/...`, `/episode/...`)
threw "Minified React error #418" (`args[]=HTML`) on load. React then threw
away the server HTML and rendered the tree again on the client.

`bun web` never shows it, because the dev server does not prerender. Check a
real build: `bun run build:web`, then `bunx wrangler dev` (the Worker's 404
handling matters), and load each route in a browser with the console open.
To find the element, compare the DOM with JavaScript off against the DOM
after load, with off-origin requests blocked so the client stays in its first
state.

## Causes and fixes

- **Window size during render.** The prerender has no window, so
  `useWindowDimensions()` reads 0 × 0 on the server and the real size on the
  client's first render. A branch on width (the settings "On this page"
  index, the search skeleton's card count) then renders different elements.
  `useWindowDimensions` from `@/lib/window-dimensions` returns the server's
  0 × 0 during hydration and the real size one commit later. Lint bans the
  React Native import.
- **The 404 shell for dynamic routes.** Cloudflare serves `404.html` (Expo's
  not-found page) for `/details/...` and the other dynamic paths, and
  `withPageMeta` only re-statuses it. The client then hydrates the details
  screen against not-found markup. `build:web` writes `404.html` with Expo's
  `__EXPO_ROUTER_HYDRATE__` flag set to false, so the client renders the
  route instead. The build fails if the flag string is not found.
- **Client-only values.** The diary welcome sample is dated by the device's
  clock and time zone, and its fades read a CSS variable. Neither exists in
  the prerender. They mount after hydration, gated on `useHydrated()`
  (`@/lib/hydrated`).
