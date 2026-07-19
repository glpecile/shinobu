# Icons render as tofu on web after @react-native-vector-icons migration

**Symptom:** After migrating `@expo/vector-icons` → `@react-native-vector-icons/ionicons/static`, every icon on web renders as a tofu/replacement-glyph box. Native is fine.

**Cause:** The `/static` variant renders a `<Text>` with `fontFamily: 'Ionicons'` but deliberately ships **no `fontSource`** — it assumes the font file was statically bundled, which only the config plugin does, and only for iOS/Android. `@expo/vector-icons` used to auto-register its fonts through expo-font on every platform; the new package registers nothing on web, so the browser has no `Ionicons` `@font-face` and falls back to tofu.

**Fix:** Register the ttf via expo-font on web only. `src/lib/icon-fonts/` is a platform-split module (`index.ts` returns `{}` on native; `index.web.ts` imports `@react-native-vector-icons/ionicons/fonts/Ionicons.ttf` — an explicit subpath export of the package) spread into the existing `useFonts` call in `app/_layout.tsx`. expo-font injects the `@font-face` rule on web; the map key must equal the icon set's `postScriptName` (`Ionicons`), because that's the `fontFamily` the component emits.

**Gotchas:**

- Needed a `declare module '*.ttf'` in `src/global.d.ts` (expo's types don't declare ttf assets).
- `useFonts`'s parameter type is a union, so spreading `Parameters<typeof useFonts>[0]` fails TS2698 — type the map as `Record<string, FontSource>` instead.
- Verify with `expo export --platform web`: the hashed `Ionicons.*.ttf` must appear under `assets/node_modules/@react-native-vector-icons/ionicons/fonts/`.

**Rule of thumb:** any future icon set added via `@react-native-vector-icons/<set>` needs two registrations: its config plugin in `app.json` (native bundling) **and** an entry in `src/lib/icon-fonts/index.web.ts` (web `@font-face`).
