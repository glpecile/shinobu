<p align="center">
  <img src="./assets/images/splash-icon.png" alt="忍" width="140" />
</p>

<h1 align="center">Shinobu (忍)</h1>

<p align="center">One app for all your media trackers. Log a movie, show, anime, or manga once, and Shinobu writes it to every tracker you've connected.</p>

<p align="center">
  <img src="./docs/images/screenshot-home.png" alt="Shinobu home with the &quot;One log. Every tracker.&quot; hero, floating provider tiles, and the web sidebar" />
</p>

<p align="center">
  <img src="./docs/images/screenshot-details.png" width="49%" alt="An anime's detail screen with its backdrop, poster, native title, overview card, progress, seasons, and related entries" />
  <img src="./docs/images/screenshot-person.png" width="49%" alt="A person's page with headshot, biography card, and a filmography timeline filtered by format and role" /><br />
  <sub>A detail page and a person page, with no tracker connected. Both pull their metadata from TMDB.</sub>
</p>

## What it does

Shinobu works with Simkl, Trakt, AniList, Letterboxd, and Serializd. Connect any of them, each through its own sign-in. There is no Shinobu account.

- **Log once.** Mark something watched and Shinobu writes it to every connected tracker that handles that kind of media, in parallel. If one write fails, Shinobu tells you which tracker failed.
- **One feed.** Your history from every connected tracker merges into a single timeline. If one tracker is down, you lose its row, not the whole screen.
- **One diary.** Every watch and read log from every tracker sits in one list, newest first. When two trackers log the same title on the same day, the diary shows one row.
- **One watchlist.** The watchlist page gathers every tracker's watchlist into one poster wall that you can filter by tracker. When you add a title, the picker shows which trackers already have it.
- **No backend, no database.** Each tracker's token is its session. Tokens stay on your device, encrypted on iOS and Android. Nothing about you is stored anywhere else.
- **Up Next in your timezone.** An episode counts as watchable once it has aired where you are, not where the show airs.
- **Local release notifications.** iOS and Android schedule reminders for upcoming episodes on the device. There is no push server.
- **A link when a write can't happen.** If a tracker rejects a write, or can't take one on your platform, you get a link to that title's page on the tracker so you can log it there.
- **Detail pages.** Metadata comes from TMDB first, with Trakt and AniList as fallbacks. Pages list cast, crew, seasons, and related titles. AniList titles also show characters, staff, recommendations, and tags. A Variants row links to the same title on TMDB and the trackers, and pressing a title copies it.
- **Episode pages.** Swipe between episodes. Marking one watched opens the next.
- **Person and studio pages.** A person's or studio's work sits on one timeline, newest first, filtered by format and role.
- **Anime seasons.** Browse each season's anime from AniList, split into series and films.
- **Four platforms.** Web, iOS, iPadOS, and Android all build from one Expo project.

## Tech stack

| | |
| --- | --- |
| [Expo](https://expo.dev) + [Expo Router](https://docs.expo.dev/router/introduction/) | One codebase for all four platforms, with file-based routing. [CNG](https://docs.expo.dev/workflow/continuous-native-generation/) generates the native projects, so they are never committed. |
| [Uniwind](https://docs.uniwind.dev) | Tailwind CSS for React Native, from the Unistyles team. Theme tokens with light and dark variants. |
| [TanStack Query](https://tanstack.com/query) | Every read and write, including caching, invalidation, and writes to several trackers at once. |
| [Effect](https://effect.website) | Typed errors, retries, and rate-limit backoff. Effect stays inside the provider service layer and never reaches a component. |
| [Nitro Modules](https://nitro.margelo.com) | [`react-native-mmkv`](https://github.com/mrousavy/react-native-mmkv) stores tokens encrypted. [`react-native-nitro-fetch`](https://github.com/margelo/react-native-nitro-fetch) sends requests through Cronet or URLSession on native. [`nitro-webview`](https://github.com/l2hyunwoo/nitro-webview) runs the tracker sign-in and write WebViews. |
| [Legend List](https://github.com/LegendApp/legend-list) | Virtualized lists everywhere. It is pure TypeScript, runs on web, and sits behind one `components/List` wrapper. |
| [expo-image](https://docs.expo.dev/versions/latest/sdk/image/) + [galeria](https://github.com/nandorojo/galeria) | Posters cached in memory and on disk, so long grids don't exhaust memory. Tap a poster or headshot to zoom. |
| [pressto](https://github.com/enzomanuelmangano/pressto) | Every pressable, with debounced, animated presses built on gesture-handler and Reanimated. |
| [pulsar](https://github.com/software-mansion/pulsar) | Haptics on press and when a log finishes. Native only, since iOS Safari has no haptics API. |
| [@expo/ui](https://docs.expo.dev/versions/latest/sdk/ui/) + [bottom sheet](https://github.com/software-mansion-labs/react-native-bottom-sheet) | Native SwiftUI and Compose controls such as date pickers and switches, plus the sheets for card actions and log confirmation. |
| [react-hook-form](https://react-hook-form.com) + [zod](https://zod.dev) | Every connect form. Client ids, tokens, and credentials are checked before any request goes out. |
| [torph](https://torph.lochie.me) + [Reanimated](https://docs.swmansion.com/react-native-reanimated/) | Text that morphs in place when your state changes it, such as progress counts and the log button's episode number. torph runs on web, and native animates one Reanimated glyph per character. |
| [react-native-keyboard-controller](https://github.com/kirillzyusko/react-native-keyboard-controller) | Keyboard avoidance that behaves the same on every platform. |
| [expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) + [expo-background-task](https://docs.expo.dev/versions/latest/sdk/background-task/) | Release reminders scheduled on the device and refreshed in the background. |
| [TMDB](https://www.themoviedb.org) | The metadata source, never a tracker. It feeds detail pages, cast and crew, and the person and studio pages. |
| [Cloudflare Workers](https://developers.cloudflare.com/workers/) | Hosts the web build, plus two relays with path allowlists for the requests browsers block. |
| [React Compiler](https://react.dev/learn/react-compiler) | Memoizes automatically. `useMemo` and `useCallback` are banned by lint. |
| [bun](https://bun.sh) | Package manager, script runner, and test runner through `bun:test`. There is no Jest. |
| [oxlint](https://oxc.rs) | Enforces the repo's conventions as lint rules. |

## Getting started

> [!NOTE]
> Shinobu links native Nitro modules, so it can't run in Expo Go. iOS and Android need a custom dev client.

```sh
bun install

bun web            # run in the browser
bun ios            # build and run the iOS dev client
bun android        # build and run the Android dev client

bun ios.clean      # regenerate the native project first, needed after
bun android.clean  # app.json, config plugin, or native dependency changes
```

Web development also needs the Worker running, because Metro doesn't serve `/api/*`:

```sh
bun run dev:worker  # wrangler dev on :8787, the Serializd and Letterboxd read proxies
```

### Checks

```sh
bun lint               # conventions, import rules, filename casing
bun check:classnames   # every composed className goes through cn()
bun check:router-push  # navigation uses usePushRoute, not useRouter().push
bun typecheck          # tsc --noEmit
bun test               # bun:test
bun check:links        # probe the provider URLs the app depends on
```

[`ci.yml`](.github/workflows/ci.yml) runs everything except `check:links` on every PR, and a PR can't merge until they pass. Provider URLs break over time rather than because of a diff, so [`link-health.yml`](.github/workflows/link-health.yml) runs `check:links` daily and on PRs that touch the provider layer.

### Web

```sh
bun run build:web   # static export
bun run deploy:web  # export, then wrangler deploy
```

The web build is live at [shinobu.glpecile.xyz](https://shinobu.glpecile.xyz).

## Releases

Android releases build from a tag on free GitHub-hosted runners, without EAS. `bun release:bump patch|minor|major|X.Y.Z` updates `expo.version` and `expo.android.versionCode` together. Pushing the matching `vX.Y.Z` tag starts [`release.yml`](.github/workflows/release.yml). It builds signed universal and arm64-v8a APKs, checksums both, and publishes a GitHub Release with categorized notes.

[`android-warm.yml`](.github/workflows/android-warm.yml) runs the same release build on `main` whenever a native input changes, and once a week. GitHub scopes caches per ref, so this build fills the Gradle cache that tag builds restore. It also catches a broken Android build before you tag. The full runbook is in [`docs/releasing.md`](docs/releasing.md).

## Docs

- [`AGENTS.md`](AGENTS.md) lists the conventions the code follows.
- [`plan.md`](plan.md) covers the product vision and architecture.
- [`docs/plans/`](docs/plans/) has one blueprint per feature, written before the build.
- [`docs/solutions/`](docs/solutions/) has one file per solved bug or non-obvious platform behavior.
- [`docs/brainstorms/`](docs/brainstorms/) holds raw exploration notes.

## License

[GPL-3.0-only](LICENSE).
