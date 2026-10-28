# 0112 — App icon setting

Settings gets an "App icon" section on iOS and Android: Shinobu (the default),
Kiss-shot, Acerola, and Orion, after Shinobu Oshino in Monogatari. The labels are
UI copy only, and the native icon names stay crimson, void, and weird, so renaming
one never needs a rebuild.

- `@hzblj/expo-app-icons` supports SDK 58, iOS appearance variants, and Android
  monochrome layers. Its Android launcher aliases leave MainActivity enabled
  for provider callbacks and switch every alias together.
- Shinobu is the default icon, unchanged. iOS follows the system through its
  light/dark/tinted set, and Android through `plugins/with-dark-adaptive-icon.js`.
  The alternates are pinned looks with no dark variant.
- `useAppIcon` reads the native selection. Android applies a pending selection
  when the app backgrounds; Settings explains this delay.
- Web has no app icon, so the section renders nothing there.
- Artwork lives in `assets/images/app-icons/`. Crimson and Void recolor the
  existing glyph mask, and Weird is a one-off.

Needs `bun ios:clean` / `bun android:clean`.
