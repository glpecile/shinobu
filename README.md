<p align="center">
  <img src="./assets/images/splash-icon.png" alt="忍" width="140" />
</p>

<h1 align="center">Shinobu (忍)</h1>

<p align="center">A DB-less, cross-platform harness for your media trackers — log a movie, show, or anime once and every one you've connected stays in sync.</p>

<p align="center">
  <img src="./docs/images/screenshot-home.png" alt="Shinobu home on web and iOS — “One log. Every tracker.” hero with floating provider tiles" />
</p>

## ✨ What it does

- 📝 **Log once** — mark something watched a single time and Shinobu writes it to every connected tracker it applies to, in parallel. If one write fails, you're told exactly which one.
- 📰 **One unified feed** — your history from every connected tracker, merged into a single timeline. A tracker having a bad day degrades to a missing row, never a blank screen.
- 🔌 **Bring your own trackers** — connect any subset of your media trackers through each service's own OAuth flow. There is no Shinobu account to create.
- 🕶️ **No backend, no database** — your tokens (encrypted, on device) *are* the session. Nothing about you is stored anywhere else.
- ⏭️ **Up Next, timezone-correct** — an episode only counts as watchable once it has actually aired in *your* timezone, not the show's.
- 📱 **Four platforms, one codebase** — Web, iOS, iPadOS, and Android from a single Expo project.

## 🛠️ Tech stack

| | |
| --- | --- |
| ⚛️ [Expo](https://expo.dev) + [Expo Router](https://docs.expo.dev/router/introduction/) | One codebase for all four platforms, file-based routing, [CNG](https://docs.expo.dev/workflow/continuous-native-generation/) — native projects are generated, never committed |
| 🎨 [Uniwind](https://docs.uniwind.dev) | Tailwind CSS for React Native, from the Unistyles team — theme tokens, light/dark variants |
| 🔄 [TanStack Query](https://tanstack.com/query) | Every read and write — caching, invalidation, and the cross-tracker write path |
| 🧬 [Effect](https://effect.website) | Typed errors, retries, and rate-limit backoff — contained to the provider service layer, never leaks into components |
| ⚡ [Nitro Modules](https://nitro.margelo.com) | [`react-native-mmkv`](https://github.com/mrousavy/react-native-mmkv) (encrypted token storage) + [`react-native-nitro-fetch`](https://github.com/margelo/react-native-nitro-fetch) (Cronet/URLSession networking on native) |
| 📜 [Legend List](https://github.com/LegendApp/legend-list) | Virtualized lists everywhere — pure TS, works on web, behind a single `components/List` wrapper |
| 🖼️ [expo-image](https://docs.expo.dev/versions/latest/sdk/image/) | Memory/disk-cached posters so long grids don't thrash memory |
| 👆 [pressto](https://github.com/enzomanuelmangano/pressto) | Every tappable surface — debounced, animated presses on gesture-handler + reanimated |
| ⌨️ [react-native-keyboard-controller](https://github.com/kirillzyusko/react-native-keyboard-controller) | Consistent keyboard avoidance on every platform |
| 🧠 [React Compiler](https://react.dev/learn/react-compiler) | Automatic memoization — `useMemo`/`useCallback` are lint-banned |
| 🥟 [bun](https://bun.sh) | Package manager, script runner, and test runner (`bun:test` — no Jest) |
| 🦀 [oxlint](https://oxc.rs) | Conventions enforced as lint rules, not prose |

## 🚀 Getting started

> [!NOTE]
> Shinobu links native Nitro modules, so it can't run in plain Expo Go — iOS/Android need a custom dev client.

```sh
bun install

bun web            # run in the browser
bun ios            # build & run the iOS dev client
bun android        # build & run the Android dev client

bun ios.clean      # regenerate the native project first — needed after
bun android.clean  # app.json / config-plugin / native-dependency changes
```

### ✅ Checks

```sh
bun lint       # oxlint
bun typecheck  # tsc --noEmit
bun test       # bun:test
```

## 📁 Structure

```
src/
  app/            Expo Router routes
  components/     Shared UI (Uniwind-styled)
  features/       Vertical slices (log-media, feed, …)
  state/queries/  TanStack Query hooks, one file per provider domain
  state/session/  Per-tracker connection state
  lib/providers/  Provider registry, routing, and per-tracker adapters
  lib/http/       nitro-fetch client (native) + fetch client (web)
  types/          Shared contracts (NormalizedMediaItem)
```
