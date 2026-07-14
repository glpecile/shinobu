# expo-router/head throws on iOS unless Handoff `origin` is configured

## Symptom

Rendering `<Head>` from `expo-router/head` on iOS crashes with:

> Render Error — Expo Head: Add the handoff origin to the Expo Config
> (requires rebuild). Add the Config Plugin
> `{ plugins: [["expo-router", { origin: "...<URL>..." }]] }`.

A clean rebuild (`bun ios.clean`) does not help — the error is about missing
config, not a stale native project.

## Cause

`expo-router/head` is **not** a web-only shim. On iOS it mounts ExpoHead,
which registers Handoff / user-activity metadata (`NSUserActivity`) so pages
can be continued on other Apple devices — and that requires knowing the
canonical hosted URL (`origin`) at build time. Without the plugin option it
throws in dev.

The trap: you reach for `Head` to set web browser-tab titles and meta tags
(SEO), ship it in a shared route file, and the iOS app crashes for a feature
(Handoff) you never asked for.

## Fix

Shinobu only wants web titles/meta, so `Head` goes through a platform-split
wrapper (`src/components/head/`, AGENTS.md: Platform-Specific Files):

- `index.web.tsx` re-exports `expo-router/head`
- `index.tsx` (native) renders `null`

Direct `expo-router/head` imports are banned via `no-restricted-imports` in
`.oxlintrc.json`, with an override for the wrapper file.

If Handoff is ever actually wanted, the alternative is to configure
`{ plugins: [["expo-router", { origin: "https://shinobu.glpecile.xyz" }]] }`
in `app.json` and do a clean native rebuild — then the wrapper's native
variant could render the real component.
