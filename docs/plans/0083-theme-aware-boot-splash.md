# Theme-aware boot splash

- Adapt Bluesky's web splash reveal: scale the Shinobu mark from 1 to 1.5
  while fading the splash over 300ms, only once startup fonts are ready.
- Keep the static web overlay outside hydration so it covers stylesheet loading.
  Inline light/dark colors match `src/global.css` before that CSS is available.
- Native uses a themed React overlay over the ready app, handing off from the
  existing OS splash on layout. Reanimated runs its reveal on the UI thread.
- Reduced motion keeps a short fade without scaling. No artificial boot delay,
  new dependencies, or native configuration changes.
- Retain the web watchdog for failed startup; font errors also release the splash.
- Validate lint, types, web export, and light/dark + reduced-motion boot behavior.

## Native logo handoff (2026-10-13)

- Keep the same bundled 200pt splash image centered while handing off from the
  OS splash; wait for both its image load and overlay layout before hiding it.
- Adapt Bluesky's logo zoom reveal, without its long intro or artificial delay:
  scale the logo to 1.5 while fading the themed overlay over 300ms on the UI thread.
- Reduced motion retains only the 120ms fade. The overlay is inaccessible and
  blocks touches until removed. No new dependency or native config change.
