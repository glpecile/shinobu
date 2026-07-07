# Shinobu Agent Conventions

Shinobu (忍) is a DB-less, cross-platform media tracker. Trakt.tv, AniList, and
Letterboxd are three **symmetric, opt-in providers** — not a primary store with
satellite imports. The core purpose of the app: log a piece of media once, and
Shinobu fans that write out to every connected provider it applies to. Reads work
the same way, aggregating whichever providers are connected into one unified feed.
See `plan.md` (1.2, 1.3, 2.1) for the full product vision and architecture rationale.

## Tech Stack

- **Expo** (Router) — targets Web, iPadOS, iOS, Android from one codebase.
- **Uniwind** — Tailwind CSS for React Native (drop-in NativeWind replacement, faster,
  built by the Unistyles team). https://docs.uniwind.dev
- **TanStack Query** — all data fetching/mutations, across Trakt REST, AniList
  GraphQL, and Letterboxd REST. This is the engine behind both the `useUnifiedFeed`
  read hook and the `useLogMedia` write fan-out described in `plan.md`.
- **Letterboxd** *does* have an official write API (OAuth Authorization Code flow,
  supports creating log entries — diary and/or review). It is **not** self-serve:
  access is granted by request only (email `api@letterboxd.com`), and Letterboxd's
  stated policy explicitly excludes "personal projects," so approval is not
  guaranteed. Build the Letterboxd provider as a first-class citizen alongside
  Trakt/AniList (see `todos/004`), but treat API access itself as an open risk — the
  CSV diary export/import path is the documented fallback if access isn't granted,
  not the primary design.
- **Effect** (`effect`) — typed errors, retries, and structured concurrency for the
  provider service layer **only** (`lib/providers/`, `lib/http/`). Tagged errors
  live in `lib/providers/errors.ts`; the fan-out's per-provider partial-failure
  contract, the 401→refresh wrapper, and rate-limit backoff are written as Effects.
  **Containment rule:** Effect never leaks upward — `state/queries/*` runs effects
  at the boundary via `Effect.runPromise` inside `queryFn`/`mutationFn`, and no
  `Effect<...>` type appears in any component, screen, or hook signature. TanStack
  Query keeps caching/invalidation/React state; do not adopt effect-rx or run
  Effect inside components. Rationale, risks, and exit criteria:
  `docs/brainstorms/2026-07-07-effect-for-provider-layer.md`.
- **`react-native-mmkv`** — persisted OAuth tokens (and any other local key/value
  state). No backend/DB: state is tied to external auth tokens only. Web works via
  MMKV's built-in `localStorage` fallback, so this stays universal across platforms.
  On native, prefer MMKV's built-in `encryptionKey` for token storage rather than
  storing tokens in plaintext.
- **`react-native-nitro-fetch`** — the network client for Trakt/AniList calls
  **on native only** (iOS/Android; built on Cronet/URLSession, no web build). Web has
  no browser equivalent, so use the platform-file convention below: a shared
  `lib/http/client.ts` (nitro-fetch) + `lib/http/client.web.ts` (plain `fetch`)
  exposing the same interface, so `state/queries/*` never imports either directly.
- **`@legendapp/list`** — virtualized lists everywhere (see "Long Lists" below).
  Pure JS/TS, works on web via react-native-web, no native rebuild to adopt.
- **bun** as the package manager and script runner. Tests use the built-in
  `bun:test` runner (`bun test`) — no Jest.
- **oxlint** for linting (`bun lint`, config in `.oxlintrc.json`) — chosen over
  Biome/ESLint for speed. Conventions that can be lint rules *are* lint rules, not
  just prose: the `@/` alias rule (no `../` imports), the `components/List` wrapper
  rule (no direct `@legendapp/list` or raw `FlatList` imports) are enforced via
  `no-restricted-imports`. When a new convention lands in this file, check whether
  oxlint can enforce it and add the rule in the same PR.

## Nitro Modules

Prefer a [Nitro Modules](https://nitro.margelo.com)-based library over a bridge-based
one whenever a Nitro alternative exists and covers the need — they're faster (no
async bridge) and type-safe by construction. `react-native-mmkv` and
`react-native-nitro-fetch` are the current examples; check
[awesome-nitro-modules](https://nitro.margelo.com/docs/resources/awesome-nitro-modules)
before reaching for a bridge-based package.

**Tradeoff to keep in mind:** Nitro modules ship native code, so once any are linked
the app can no longer run inside plain Expo Go — it needs a custom dev client
(`expo prebuild` + `expo run:ios` / `expo run:android`, or an EAS dev-client build).
This is already true for this project (`react-native-mmkv`, `react-native-nitro-fetch`,
`react-native-nitro-modules` are linked).

## Continuous Native Generation (CNG)

Shinobu uses [Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/)
— `android/` and `ios/` are **generated, not committed** (gitignored). They're
produced on demand by `npx expo prebuild` (or automatically by `expo run:ios` /
`expo run:android`) from `app.json` + installed config plugins + autolinking. Never
hand-edit files inside `android/`/`ios/` — those edits are lost on the next
`expo prebuild --clean`. Any native-level change belongs in `app.json`, a config
plugin, or a dependency choice, not in the generated output.

**Clean prebuild vs. hot reload — always tell the user which one a change needs.**
After making a change, explicitly say whether it's picked up live or requires a
native regeneration:

- **Hot reload (no action):** JS/TS-only edits — anything under `src/`, styles,
  assets consumed by the JS bundle. Metro reloads them into the running dev client.
- **Rebuild required (`bun ios.clean` / `bun android.clean` — regenerates the
  native project, then builds and runs):** edits to `app.json` (icons, splash,
  plugins, schemes),
  adding/removing/upgrading any dependency that ships native code, or config-plugin
  changes. The running app won't reflect these until the native project is
  regenerated and reinstalled.
- **`pod install` version-mismatch errors** (e.g. "differs from the version stored
  in `Pods/Local Podspecs`") mean the generated `ios/` is stale — clean-prebuild it;
  never `pod update` individual pods
  (`docs/solutions/pod-install-stale-podfile-lock.md`).

## Providers, Sessions & Log Fan-Out

- **Opt-in, per-provider sessions.** There is no Shinobu account. A user connects any
  subset of {Trakt, AniList, Letterboxd} via that provider's own OAuth flow; the
  resulting token (stored via `react-native-mmkv`) *is* the session for that provider.
  `state/session/` tracks which providers are currently connected, mirroring
  bluesky-social's `state/session` pattern.
- **Logging fans out.** The core write path is `useLogMedia` (or similarly named
  mutation): given a `NormalizedMediaItem` and a log intent (watched/read), it routes
  to every *connected* provider *applicable to that item's type* and fires the writes
  in parallel — it is never a single-provider write.
- **Routing isn't a 1:1 type map.** Movies route to Trakt + Letterboxd. TV routes to
  Trakt. Manga routes to AniList. Anime *films* are the edge case: they're `ANIME` in
  AniList but also a `MOVIE` for Trakt/Letterboxd purposes (signaled by `isFilm` on
  `NormalizedMediaItem`, not a fifth `MediaType`), so they can fan out to all three.
  This lives in `src/lib/providers/routing.ts` (pure functions, unit-tested) — never
  inline `if (type === ...)` or `if (provider === ...)` checks at call sites.
- **Providers declare capabilities.** `src/lib/providers/registry.ts` is the single
  provider registry: each provider declares which `MediaType`s it handles, `canRead`
  (aggregated by `useUnifiedFeed`), and `canWrite` (a `useLogMedia` fan-out target).
  Never assume a provider is symmetric read+write — future domains (games, books,
  music) are routinely read-only or CSV-only (Goodreads' API is dead, RYM has none,
  Steam is read-only), and even Letterboxd may end up degraded (`todos/004`). Adding
  or degrading a provider — or a whole new domain — means widening the
  `MediaType`/`ProviderId` unions and the registry, nothing else. See
  `docs/plans/0005-provider-capability-model.md`.
- **Surface partial failure.** If one connected provider's write fails while others
  succeed, the caller must know which one failed — don't swallow it into a single
  boolean/throw.

## Theming

Colors are theme tokens defined once in `src/global.css` (Uniwind's `@theme`/
`@variant light|dark` pattern), not hardcoded hex in components. Both `light` and
`dark` variants must define the same variable set (Uniwind requirement). Current
tokens: `background`, `surface`, `foreground`, `muted`, `border`, `accent`,
`accent-foreground` — consume them as `bg-background`, `text-foreground`, etc. `accent`
is pinned to the same Vampiric Crimson (`#DC2626`, `plan.md` 1.1) in both themes; it's
a brand color, not theme-adaptive. The app follows the OS theme by default (Uniwind's
`system` mode) — dark is the primary/designed-for mode per `plan.md` 1.1, but light
must render correctly too, not just "not crash." Never ship a new hardcoded hex color
in a component; add a token to `global.css` instead.

Typography works the same way: **Space Grotesk** (display — titles, headings,
flash-frames) and **Inter** (UI text) are loaded via expo-font in `app/_layout.tsx`
and exposed as font tokens in `global.css` (`font-display`, `font-sans`,
`font-sans-semibold`). React Native treats each weight as its own font family and
won't synthesize weights for custom fonts — so never combine `font-bold`/
`font-semibold` with a custom font class; add a new weight token (and load its font
in `_layout.tsx`) instead. The 忍 kanji intentionally renders in the OS fallback
font (neither family ships kanji).

## Long Lists

Every core surface (unified feed, library grids, Up Next) is a long virtualized
list of media cards — hundreds to thousands of items. Use
[`@legendapp/list`](https://github.com/LegendApp/legend-list) (Legend List), never
raw `FlatList`/`ScrollView`-with-`map`, for any data-driven list. It's written 100%
in JS/TS: no native code (no prebuild/rebuild to adopt, hot-reload only) and it runs
on web via `react-native-web` — one implementation for all four targets, no separate
web retrofit needed by default.

- **Wrap it once.** Screens never import `@legendapp/list` directly; they use a
  shared `components/List` wrapper (bluesky-social does exactly this with its own
  `List` component). If Legend List's web behavior ever disappoints, swap in a
  web-specific implementation via `components/List/index.web.tsx` (e.g. TanStack
  Virtual) without touching any call site.
- **Recycling gotcha:** with `recycleItems` enabled, item components are reused
  across rows — item state must derive from props; local `useState`/`useRef` inside
  an item leaks into the row it gets recycled to. Leave recycling off unless a list
  measurably needs it.
- **Poster images in rows go through `expo-image`** (built-in memory/disk cache,
  `recyclingKey` support) — long grids of remote covers through RN's core `Image`
  will thrash memory on mobile.

## Up Next & Timezones

A show only counts as "up next" (next unwatched episode available to watch) once its
episode has **actually aired in the user's local timezone** — not the show's origin
timezone, and not a naive date-only comparison. Provider air-date/time fields (Trakt,
AniList `airingSchedule`) must be treated as instants (parse with timezone/offset
info, not as bare date strings), converted to the user's local time, and compared
against "now" before an episode is considered released. Getting this wrong either
spoils an episode that hasn't aired yet (showing it as available) or hides one that
has (comparing calendar dates naively across a timezone boundary). Centralize this
comparison in one utility (e.g. `lib/time/hasAired.ts`) rather than reimplementing it
per provider or per screen.

## Notifications

Release notifications are **local-only, scheduled ahead of time**: air dates are
known in advance, so on app foreground schedule local notifications
(expo-notifications) for the next ~7–14 days of upcoming episodes/releases — no push
server, ever. Scheduling must go through the same timezone-correct
`lib/time/hasAired.ts` logic as Up Next (`todos/006` is a prerequisite). Web gets the
in-app Up Next feed only — serverless web push doesn't exist. The only permissible
future server exception is a tiny *stateless* push relay, and only if local-schedule
staleness proves painful in practice (`docs/plans/0005`).

## Web & CORS

There is no backend, so on web the app calls provider APIs directly from the browser
— which only works if the provider sends CORS headers. Policy: a provider that
blocks browser origins is **native-only on web** ("connect on mobile"), never
proxied. Verify each provider with a browser-origin spike before building its web
read path (`todos/008`), and record findings in `docs/solutions/web-cors-*.md`.

## Golden Reference

When unsure how to structure something cross-platform (web + iOS + Android), default
to how [bluesky-social/social-app](https://github.com/bluesky-social/social-app)
solves it — it's the most mature open-source universal Expo app, and its own
[CLAUDE.md](https://github.com/bluesky-social/social-app/blob/main/CLAUDE.md)
documents exactly this kind of convention (query hook naming, platform-specific file
grouping, import aliases). Adapt, don't copy verbatim: Shinobu has no backend/atproto
and a much smaller design system.

## Project Structure (target)

```
src/
  app/            Expo Router routes (file-based)
  components/     Shared, platform-agnostic UI (Uniwind-styled)
  features/       Vertical slices bridging screens + data (e.g. features/logMedia)
  state/queries/  TanStack Query read hooks, one file per provider domain
  state/session/  Per-provider connection state (which providers are connected)
  lib/providers/  Provider routing table + per-provider write adapters
  lib/http/       client.ts (nitro-fetch, native) + client.web.ts (fetch, web)
  types/          Shared contracts, e.g. types/media.ts (NormalizedMediaItem)
```

## Import Alias

`@/*` maps to `src/*` (`tsconfig.json` `paths`; Metro resolves it natively — no
babel plugin needed). Use `@/` for any import that crosses directories
(`import type { MediaType } from '@/types/media'`); plain `./` stays fine for
same-directory siblings. Don't add new relative `../` imports.

## Platform-Specific Files

Group into a directory rather than suffixing a lone file:

```
components/Foo/index.tsx        # shared/default
components/Foo/index.web.tsx    # web-only
components/Foo/index.native.tsx # iOS + Android
```

Never manually branch on `require()` or conditional imports — the bundler resolves
platform variants automatically from the filename.

## Data Contract

All network responses (Trakt, AniList, Letterboxd) must be normalized into
`NormalizedMediaItem` (`types/media.ts`, see `plan.md` 2.2) before reaching
components. Components never see raw provider payload shapes.

## Query Hook Conventions

- Name read hooks `useXQuery` (e.g. `useWatchedShowsQuery`), one per provider domain
  under `state/queries/`.
- Name the write fan-out mutation `useLogMedia` (singular, cross-provider) — do not
  create separate per-provider "log" hooks that components call individually; the
  fan-out and per-provider routing belongs inside that one hook.
- One query-key builder per domain, e.g. `createTraktQueryKey({...})`.
- Wrap OAuth-token-bearing calls so a 401 triggers the refresh flow before failing.

## Compound Knowledge

- `docs/plans/` — implementation blueprints, written before building a feature.
- `docs/brainstorms/` — raw exploration/ideation notes.
- `docs/solutions/` — one file per solved bug or non-obvious pattern, searchable.
- `todos/` — work items, named `NNN-status-priority-title.md`.

**Every time a network anomaly or non-obvious fix happens** (rate limits, pagination
mismatches, OAuth refresh edge cases, GraphQL boundary quirks), write it to
`docs/solutions/` immediately — don't just fix the code. Any planning pass must scan
`docs/solutions/` first, before proposing a refactor or new integration.
