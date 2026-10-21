# Uniwind hides RN 0.88's AssetRegistry from expo-asset

On SDK 58 (RN 0.88), Android logged on every launch:

```
Uncaught (in promise) TypeError: Cannot read property 'getAssetByID' of undefined
  at fromModule (expo-asset/build/Asset.js)
  ... expo-symbols unstable_getMaterialSymbolSourceAsync
  ... expo-router native-tabs materialIconConverter.android
```

RN 0.88 exposes the asset registry as `import { AssetRegistry } from 'react-native'`,
and expo-asset 58 uses it. Uniwind's Metro resolver rewrites `react-native` imports
from node_modules to `uniwind/components`, a hand-written re-export that (through
1.13.0) has no `AssetRegistry` getter. iOS was unaffected because only Android
renders native-tab icons through the Material Symbols font.

Fix: `metro.config.js` wraps Uniwind's `resolveRequest` so `react-native` imported
from `expo-asset` resolves to the real module on native. expo-asset styles no
components, so it never needed Uniwind's swap. Remove the wrapper once a Uniwind
release re-exports `AssetRegistry`. Metro config changes need a Metro restart,
not a native rebuild.
