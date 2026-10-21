# Uniwind hides RN 0.88's AssetRegistry from expo-asset

On SDK 58 (RN 0.88), Android logged on every launch:

```
Uncaught (in promise) TypeError: Cannot read property 'getAssetByID' of undefined
  at fromModule (expo-asset/build/Asset.js)
  ... expo-symbols unstable_getMaterialSymbolSourceAsync
  ... expo-router native-tabs materialIconConverter.android
```

The same gap silently broke `useFonts` in `src/app/_layout.tsx` on iOS and Android:
`expo-font` resolves each bundled font through `expo-asset`, the load rejected, and
the app fell back to system fonts (only `Ionicons` in
`ExpoFontLoader.getLoadedFonts()`), with no red box.

RN 0.88 exposes the asset registry as `import { AssetRegistry } from 'react-native'`,
and expo-asset 58 uses it. Uniwind's Metro resolver rewrites `react-native` imports
from node_modules to `uniwind/components`, a hand-written re-export that (through
1.13.0) has no `AssetRegistry` getter. Only Android logs the error, from its
Material Symbols tab icons; the font failure shows nowhere but the typography.

Fix: `metro.config.js` wraps Uniwind's `resolveRequest` so `react-native` imported
from `expo-asset` resolves to the real module on native. expo-asset styles no
components, so it never needed Uniwind's swap. Remove the wrapper once a Uniwind
release re-exports `AssetRegistry`. Metro config changes need a Metro restart,
not a native rebuild.
