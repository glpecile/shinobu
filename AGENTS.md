# Shinobu Agent Conventions

Shinobu (忍): DB-less, cross-platform media tracker. Trakt.tv, AniList, and
Letterboxd are three **symmetric, opt-in providers** — not a primary store with
satellite imports. Core purpose: log media once, Shinobu fans that write out to
every connected provider it applies to. Reads aggregate whichever providers are
connected into one unified feed. Full product vision + architecture rationale:
`plan.md` (1.2, 1.3, 2.1).

## Tech Stack

- **Expo** (Router) — one codebase targets Web, iPadOS, iOS, Android.
- **Uniwind** — Tailwind CSS for React Native (drop-in NativeWind replacement,
  faster, by the Unistyles team). https://docs.uniwind.dev
- **TanStack Query** — all data fetching/mutations across Trakt REST, AniList
  GraphQL, Letterboxd REST. Engine behind the `useUnifiedFeed` read hook and the
  `useLogMedia` write fan-out (`plan.md`).
- **Letterboxd** *does* have an official write API (OAuth Authorization Code flow,
  creates log entries — diary and/or review). **Not** self-serve: access by request
  only (email `api@letterboxd.com`), and Letterboxd policy explicitly excludes
  "personal projects," so approval isn't guaranteed. Build Letterboxd as a
  first-class provider alongside Trakt/AniList (`todos/004`), but treat API access
  as an open risk — the CSV diary export/import path is the documented fallback if
  access isn't granted, not the primary design.
- **Effect** (`effect`) — typed errors, retries, structured concurrency for the
  provider service layer **only** (`lib/providers/`, `lib/http/`). Tagged errors:
  `lib/providers/errors.ts`. The fan-out's per-provider partial-failure contract,
  the 401→refresh wrapper, and rate-limit backoff are Effects. **Containment rule:**
  Effect never leaks upward — `state/queries/*` runs effects at the boundary via
  `Effect.runPromise` inside `queryFn`/`mutationFn`; no `Effect<...>` type in any
  component, screen, or hook signature. TanStack Query keeps
  caching/invalidation/React state. Don't adopt effect-rx (oxlint-banned) or run
  Effect inside components. Rationale/risks/exit criteria:
  `docs/brainstorms/2026-07-07-effect-for-provider-layer.md`.
- **`react-native-mmkv`** — persisted OAuth tokens (and any local key/value state).
  No backend/DB: state tied to external auth tokens only. Web uses MMKV's built-in
  `localStorage` fallback, so it stays universal across platforms. On native, prefer
  MMKV's built-in `encryptionKey` for token storage over plaintext.
- **`react-native-nitro-fetch`** — network client for Trakt/AniList calls **on
  native only** (iOS/Android; built on Cronet/URLSession, no web build). Web has no
  equivalent, so use the platform-file convention below: shared
  `lib/http/client.ts` (nitro-fetch) + `lib/http/client.web.ts` (plain `fetch`)
  exposing one interface, so `state/queries/*` never imports either directly.
- **`@legendapp/list`** — virtualized lists everywhere (see "Long Lists" below).
  Pure JS/TS, works on web via react-native-web, no native rebuild to adopt.
- **bun** — package manager and script runner. Tests use the built-in `bun:test`
  runner (`bun test`) — no Jest.
- **oxlint** — linting (`bun lint`, config `.oxlintrc.json`) — chosen over
  Biome/ESLint for speed. Conventions that can be lint rules *are* lint rules, not
  prose: the `@/` alias rule (no `../` imports), the `components/List` wrapper rule
  (no direct `@legendapp/list` or raw `FlatList`), kebab-case filenames across
  `src/`, and the effect-rx ban are enforced via `no-restricted-imports` /
  `unicorn/filename-case`. When a new convention lands here, check whether oxlint can
  enforce it and add the rule in the same PR.
- **pressto** — every tappable surface. Never use react-native's `Pressable`
  or the `Touchable*` family (oxlint-enforced); import `PresstableScale` /
  `PresstableOpacity` from `components/presstable`. The wrapper adds a
  leading-edge press debounce (a quick double-tap on a media card must not
  push the details route twice) and the withUniwind className mapping. Built
  on gesture-handler + reanimated — `GestureHandlerRootView` wraps the app in
  `app/_layout.tsx`.
- **`react-native-keyboard-controller`** — all keyboard avoidance/animation.
  Never use react-native's core `KeyboardAvoidingView` (inconsistent per platform);
  import the `components/keyboard-avoiding-view` wrapper (withUniwind-wrapped,
  oxlint-enforced). `KeyboardProvider` is mounted in `app/_layout.tsx`. Native
  module — adding/upgrading it needs a clean rebuild.
- **TMDB** is a **metadata source, not a tracker**: no session, no registry entry,
  never a log fan-out target. It is the **primary metadata source for every detail
  screen** (`docs/plans/0014-tmdb-first-details.md`): the composed
  `getMediaDetails` read (`lib/providers/media-details.ts`) serves catalogue
  metadata + cast/crew/studios TMDB-first and **fails over to Trakt/AniList inside
  the effect** (no token, no TMDB id, or request failure) — never in a component.
  Display fields merge TMDB-over-provider via `applyPrimaryMetadata`
  (`lib/providers/merge-metadata.ts`); user state (progress, watched, seasons,
  logging) stays provider-sourced. TMDB is also the single source of truth for the
  `/person/[id]` and `/studio/[id]` routes (both keyed by TMDB id; provider-sourced
  people/studios without one resolve by name via the `/lookup` sibling routes). Auth
  is the builder-supplied `EXPO_PUBLIC_TMDB_TOKEN` (v4 read token); unset → detail
  screens use provider paths and person/studio pages stay dark. Browser-callable
  (`docs/solutions/web-cors-tmdb.md`).
- **`@nandorojo/galeria`** — tap-to-zoom image viewer (details poster, person
  headshot). Never import it directly (oxlint-enforced); use
  `components/zoomable-image`, which pairs it with the withUniwind `Image` and
  handles the empty-uri fallback. Native module — needs a clean rebuild — and it
  pins iOS ≥ 16.4 (`expo-build-properties` in `app.json`).
- **torph** — dependency-free animated text morphing (https://torph.lochie.me),
  **web only** (renders DOM, no native build). Never import `torph/react` directly
  (oxlint-enforced); use `MorphText` from `components/morph-text` — its
  `index.web.tsx` morphs in-place text changes (shared characters slide, the rest
  crossfades) while `index.tsx` falls back to a plain `Text` on native, so the
  animation is an enhancement, never part of the contract. Reserve it for text
  that *changes in place* as a result of user state (progress counts, watched
  lines, the log button's episode number) — not for static or mount-time text
  (first render never animates) and not for high-frequency churn. Pure JS: hot
  reload, no rebuild.
- **React Compiler** — enabled via `experiments.reactCompiler` in `app.json` and
  `babel-plugin-react-compiler`. Auto-memoizes components and hooks, so don't use
  `useMemo` or `useCallback` manually — forbidden by the `no-restricted-imports`
  rule in `.oxlintrc.json`. Rare opt-out: the `'use no memo'` directive on that
  component, documented in the PR.

## Nitro Modules

Prefer a [Nitro Modules](https://nitro.margelo.com)-based library over a bridge-based
one whenever a Nitro alternative exists and covers the need — faster (no async
bridge) and type-safe by construction. `react-native-mmkv` and
`react-native-nitro-fetch` are the current examples; check
[awesome-nitro-modules](https://nitro.margelo.com/docs/resources/awesome-nitro-modules)
before reaching for a bridge-based package.

**Tradeoff:** Nitro modules ship native code, so once any are linked the app can't
run inside plain Expo Go — it needs a custom dev client (`expo prebuild` +
`expo run:ios` / `expo run:android`, or an EAS dev-client build). Already true here
(`react-native-mmkv`, `react-native-nitro-fetch`, `react-native-nitro-modules`
are linked).

## Continuous Native Generation (CNG)

Shinobu uses [Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/)
— `android/` and `ios/` are **generated, not committed** (gitignored). Produced on
demand by `npx expo prebuild` (or automatically by `expo run:ios` /
`expo run:android`) from `app.json` + config plugins + autolinking. Never hand-edit
files inside `android/`/`ios/` — those edits are lost on the next
`expo prebuild --clean`. Any native-level change belongs in `app.json`, a config
plugin, or a dependency choice, not the generated output.

**Clean prebuild vs. hot reload — always tell the user which one a change needs.**
After a change, state whether it's picked up live or requires native regeneration:

- **Hot reload (no action):** JS/TS-only edits — anything under `src/`, styles,
  assets consumed by the JS bundle. Metro reloads them into the running dev client.
- **Rebuild required (`bun ios.clean` / `bun android.clean` — regenerates the
  native project, then builds and runs):** edits to `app.json` (icons, splash,
  plugins, schemes), adding/removing/upgrading any dependency that ships native
  code, or config-plugin changes. The running app won't reflect these until the
  native project is regenerated and reinstalled.
- **`pod install` version-mismatch errors** (e.g. "differs from the version stored
  in `Pods/Local Podspecs`") mean the generated `ios/` is stale — clean-prebuild it;
  never `pod update` individual pods
  (`docs/solutions/pod-install-stale-podfile-lock.md`).

## Providers, Sessions & Log Fan-Out

- **Opt-in, per-provider sessions.** No Shinobu account. A user connects any subset
  of {Trakt, AniList, Letterboxd} via that provider's own OAuth flow; the resulting
  token (stored via `react-native-mmkv`) *is* the session for that provider.
  `state/session/` tracks which providers are connected, mirroring bluesky-social's
  `state/session` pattern.
- **Logging fans out.** The core write path is `useLogMedia`: given a
  `NormalizedMediaItem` and a log intent (watched/read), it routes to every
  *connected* provider *applicable to that item's type* and fires the writes in
  parallel — never a single-provider write.
- **Routing isn't a 1:1 type map.** Movies → Trakt + Letterboxd. TV → Trakt.
  Manga → AniList. Anime *films* are the edge case: they're `ANIME` in AniList but
  also a `MOVIE` for Trakt/Letterboxd (signaled by `isFilm` on
  `NormalizedMediaItem`, not a fifth `MediaType`), so they fan out to all three.
  Lives in `src/lib/providers/routing.ts` (pure functions, unit-tested) — never
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
`accent-foreground` — consume them as `bg-background`, `text-foreground`, etc.
`accent` is pinned to Vampiric Crimson (`#DC2626`, `plan.md` 1.1) in both themes —
a brand color, not theme-adaptive. The app follows the OS theme by default (Uniwind
`system` mode) — dark is the primary/designed-for mode (`plan.md` 1.1), but light
must render correctly too, not just "not crash." Never ship a new hardcoded hex color
in a component; add a token to `global.css` instead.

Typography works the same way: **Space Grotesk** (display — titles, headings,
flash-frames) and **Inter** (UI text) load via expo-font in `app/_layout.tsx` and
are exposed as font tokens in `global.css` (`font-display`, `font-sans`,
`font-sans-semibold`). React Native treats each weight as its own font family and
won't synthesize weights for custom fonts — never combine `font-bold`/`font-semibold`
with a custom font class; add a new weight token (and load its font in
`_layout.tsx`) instead. The 忍 kanji intentionally renders in the OS fallback font
(neither family ships kanji).

## Long Lists

Every core surface (unified feed, library grids, Up Next) is a long virtualized
list of media cards — hundreds to thousands of items. Use
[`@legendapp/list`](https://github.com/LegendApp/legend-list) (Legend List), never
raw `FlatList`/`ScrollView`-with-`map`, for any data-driven list. 100% JS/TS: no
native code (no prebuild/rebuild to adopt, hot-reload only) and it runs on web via
`react-native-web` — one implementation for all four targets, no separate web
retrofit by default.

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
  thrash memory on mobile. Import it via the `components/image` wrapper
  (`withUniwind(ExpoImage)`), never directly: uniwind silently drops `className`
  on third-party components on native (oxlint-enforced; see
  `docs/solutions/uniwind-classname-third-party-components.md`).

## Up Next & Timezones

A show counts as "up next" (next unwatched episode available to watch) only once its
episode has **actually aired in the user's local timezone** — not the show's origin
timezone, not a naive date-only comparison. Provider air-date/time fields (Trakt,
AniList `airingSchedule`) must be treated as instants (parse with timezone/offset
info, not bare date strings), converted to the user's local time, and compared
against "now" before an episode counts as released. Getting this wrong spoils an
unaired episode (shown as available) or hides an aired one (naive calendar-date
compare across a timezone boundary). Centralize this comparison in one utility (e.g.
`lib/time/hasAired.ts`), not per provider or per screen.

## Notifications

Release notifications are **local-only, scheduled ahead of time**: air dates are
known in advance, so on app foreground schedule local notifications
(expo-notifications) for the next ~7–14 days of upcoming episodes/releases — no push
server, ever. Scheduling goes through the same timezone-correct
`lib/time/hasAired.ts` logic as Up Next (`todos/006` is a prerequisite). Web gets the
in-app Up Next feed only — serverless web push doesn't exist. The only permissible
future server exception is a tiny *stateless* push relay, and only if local-schedule
staleness proves painful in practice (`docs/plans/0005`).

## Web & CORS

No backend, so on web the app calls provider APIs directly from the browser — works
only if the provider sends CORS headers. Policy: a provider that blocks browser
origins is **native-only on web** ("connect on mobile"), never proxied. Verify each
provider with a browser-origin spike before building its web read path (`todos/008`);
record findings in `docs/solutions/web-cors-*.md`.

## Golden Reference

When unsure how to structure something cross-platform (web + iOS + Android), default
to how [bluesky-social/social-app](https://github.com/bluesky-social/social-app)
solves it — the most mature open-source universal Expo app; its
[CLAUDE.md](https://github.com/bluesky-social/social-app/blob/main/CLAUDE.md)
documents exactly this kind of convention (query hook naming, platform-specific file
grouping, import aliases). Adapt, don't copy verbatim: Shinobu has no backend/atproto
and a much smaller design system.

For AniList specifics, the reference is
[lotusprey/otraku](https://github.com/lotusprey/otraku) — a mature open-source
AniList client (Flutter, so adapt patterns, not code). Its auth flow is the model
for Shinobu's seamless AniList connect: an app-owned embedded client id with the
OAuth **implicit grant** (`response_type=token`, no secret, no user-supplied
credentials), the token parsed from the redirect URL fragment by a dedicated auth
route, and the client's single registered redirect URL pointing at the app's own
deep link (`docs/plans/0011-anilist-integration.md`).

## Compound Components

When a shared UI component is a parent/children structure with implicit shared
state (numbering, selection, grouping), build it compound-component style: a
parent that provides context, with subcomponents attached as properties —
instead of prop-drilling indices or passing config arrays. Reference:
`src/components/steps.tsx` — `<Steps>` auto-numbers its `<Steps.Item>` children
via context, so steps can be added or reordered without touching a `number`
prop at any call site. Promote an inline sub-layout to this pattern once a second
screen needs it.

## File Naming

Component and hook files use **kebab-case** (oxlint-enforced across `src/` via
`unicorn/filename-case`):

- `src/components/media-card.tsx`
- `src/components/connect-trakt-button.tsx`
- `src/state/session/use-provider-client-id.ts`

Directory names stay lowercase. Exported React component names stay PascalCase and
hook names camelCase (JSX/JS requires it) — the kebab-case rule is on the filename,
not the export.

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
- Name the write fan-out mutation `useLogMedia` (singular, cross-provider) — no
  separate per-provider "log" hooks that components call individually; the fan-out
  and per-provider routing lives inside that one hook.
- One query-key builder per domain, e.g. `createTraktQueryKey({...})`.
- Wrap OAuth-token-bearing calls so a 401 triggers the refresh flow before failing.
- Suspense variants are named `useSuspenseXQuery`, next to their plain `useXQuery`
  sibling in the same file (e.g. `state/queries/trakt.ts`) — added for consumers
  mounted under a boundary, never a replacement.

## Loading & Error States

Prefer Suspense and error boundaries over if-guard branching
(`if (isLoading) return <Skeleton />`, `if (isError) return <Error />`) in
screen components. Boundaries keep the happy path unindented and co-locate
each failure with the section it affects, instead of one top-level guard that
blanks the whole screen.

- **Section level:** mount self-contained, query-backed sections under
  `components/SuspenseSection` — a `<Suspense>` (skeleton `fallback`) wrapped
  in an error boundary that hides just that section on failure and retries
  when `resetKey` changes. Reference: `src/app/details/[id].tsx`,
  `features/show-seasons/seasons-section.tsx`.
- **Granularity preserves partial failure.** Give each independently-fetched
  section its own boundary rather than one screen-wide guard: one provider
  failing degrades to a missing/skeleton row, not a blank feed — the same
  per-provider partial-failure contract as the log fan-out. The home feed
  (`src/app/index.tsx`) follows this: every carousel row is a `SuspenseSection`
  wrapping a per-slot `useSuspense*Query` hook (`features/feed/feed-rows.tsx`
  + `state/queries/use-unified-feed.ts`).
- **App level:** `react-error-boundary` + `components/error-fallback` wraps the
  root in `app/_layout.tsx` as the last-resort catch. A screen that needs its
  own full-screen fallback exports Expo Router's `ErrorBoundary` from the
  route file.
- Legitimate remaining derived-flag uses: cross-provider aggregate status
  (e.g. a "some content could not be loaded" notice computed from several
  queries) and mutations. Branching on a single query's `isLoading`/`isError`
  is the smell this rule bans.

Not oxlint-enforceable (banning `isLoading`/`isError` reads would also hit the
legitimate aggregate cases) — enforced in review.

## Compound Knowledge

- `docs/plans/` — implementation blueprints, written before building a feature.
- `docs/brainstorms/` — raw exploration/ideation notes.
- `docs/solutions/` — one file per solved bug or non-obvious pattern, searchable.
- `todos/` — work items, named `NNN-status-priority-title.md`.
- `.agents/skills/` — third-party agent skills vendored via the
  [`skills` CLI](https://github.com/vercel-labs/skills) and pinned in
  `skills-lock.json`. Canonical, agent-agnostic location; `.claude/skills` is a
  symlink to it (other agents can symlink the same dir). Add with
  `bunx skills add <repo> --skill <name> -y -a claude-code`, update with
  `bunx skills update`. Don't hand-edit vendored skills; if one contradicts
  AGENTS.md (e.g. recommending NativeWind over Uniwind), AGENTS.md wins — remove
  the skill.

**Every time a network anomaly or non-obvious fix happens** (rate limits, pagination
mismatches, OAuth refresh edge cases, GraphQL boundary quirks), write it to
`docs/solutions/` immediately — don't just fix the code. Any planning pass must scan
`docs/solutions/` first, before proposing a refactor or new integration.
