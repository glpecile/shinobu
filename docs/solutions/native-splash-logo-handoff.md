# Native splash logo handoff

The OS splash uses `assets/images/splash-icon.png` at `imageWidth: 200`.
Replacing it with a font glyph and title in React changes the mark's size and
shape just before the reveal.

`components/boot-splash` uses the same image and dimensions. It mounts
before the app, while fonts load, and the app tree renders only once the
overlay's image has loaded and laid out. The commit that mounts the app then
hides the OS splash from a layout effect and starts the fade in the same
step. Its 300ms UI-thread fade scales the logo to 1.5; reduced motion uses a
120ms fade without scaling. This adapts Bluesky's logo reveal without its
long intro sequence.

Don't gate the handoff on `onLayout` or `onLoadEnd` after the app mounts.
Those events queue behind the JS work of the app's first commit, including
query subscriptions, revalidation fetches and the re-renders they schedule.
That held the reveal about 1 s past Home's commit in dev builds. Don't wait on
`hideAsync()`'s promise before fading either: its resolution queues behind the
same work. The faded overlay is `pointer-events-none` because it unmounts only
once the JS thread is free.

The fade's completion marks the boot as revealed
(`components/boot-splash/revealed.ts`). Work the first screen doesn't show
waits for that, see `docs/solutions/native-tabs-mount-every-tab-at-launch.md`.

The overlay must live inside `PersistQueryClientProvider`: Shinobu's shared
`Image` wrapper calls a poster query even for local images. Rendering the
overlay outside that provider throws before it can hide the OS splash.
It stays outside the app error boundary, so an initial render failure still
hands off the OS splash and exposes the fallback's retry action.

Verified that iPhone simulator startup reaches the home screen. Android and
release-build motion still require device verification. JS/assets only; no
clean native prebuild is required.
