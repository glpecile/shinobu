# 0112 — App icon setting

Settings gets an "App icon" section on iOS and Android: Shinobu (the default),
Kiss-shot, Acerola, and Orion, after Shinobu Oshino in Monogatari. The labels are
UI copy only, and the native icon names stay Crimson, Void, and Weird, so renaming
one never needs a rebuild.

- `expo-alternate-app-icons`, not `@mozzius/expo-dynamic-app-icon`. It takes
  per-icon iOS light/dark/tinted variants and Android monochrome layers, and
  supports SDK 58.
- Shinobu is the default icon, unchanged. iOS follows the system through its
  light/dark/tinted set, and Android through `plugins/with-dark-adaptive-icon.js`.
  The alternates are pinned looks with no dark variant.
- The OS owns the current icon (`getAppIconName`), so nothing is persisted.
- Web has no app icon, so the section renders nothing there.
- Artwork lives in `assets/images/app-icons/`. Crimson and Void recolor the
  existing glyph mask, and Weird is a one-off.

Needs `bun ios:clean` / `bun android:clean`.
