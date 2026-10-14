# Native splash logo handoff

The OS splash uses `assets/images/splash-icon.png` at `imageWidth: 200`.
Replacing it with a font glyph and title in React changes the mark's size and
shape just before the reveal.

`components/boot-splash` uses the same image and dimensions, waits for image
load and overlay layout, then hides the OS splash. Its 300ms UI-thread fade
scales the logo to 1.5; reduced motion uses a 120ms fade without scaling.
There is no extra loading delay. This adapts Bluesky's logo reveal without
its long intro sequence.

The overlay must live inside `PersistQueryClientProvider`: Shinobu's shared
`Image` wrapper calls a poster query even for local images. Rendering the
overlay outside that provider throws before it can hide the OS splash.
It stays outside the app error boundary, so an initial render failure still
hands off the OS splash and exposes the fallback's retry action.

Verified that iPhone simulator startup reaches the home screen. Android and
release-build motion still require device verification. JS/assets only; no
clean native prebuild is required.
