# Shinobu Agent Conventions

Shinobu (忍): DB-less, cross-platform media tracker. Simkl, Trakt, AniList,
Letterboxd, and Serializd are **symmetric, opt-in providers**, not a primary store
with satellite imports. Log media once; Shinobu writes it to every connected
provider it applies to, and reads aggregate the connected providers into one feed.
No Shinobu account, backend, or DB: a provider's token *is* its session.

Simkl "just works" (bundled client id, one-tap PKCE). **Trakt is
bring-your-own-everything**: the app ships no Trakt credentials and activates only
once the user enters their own API app's client id *and* secret
(`docs/plans/0034-simkl-provider-and-trakt-detachment.md`). Don't re-propose a
bundled Trakt key.

Product vision + architecture: `plan.md` (1.2, 1.3, 2.1).

## Scope

**YAGNI.** Build what the task asks for: no interface with one implementation, no
factory for one product, no config for a value that never changes, no scaffolding
for a later PR. Reuse what's in the repo before adding anything; reach for the
platform or an installed dependency before a new one. Deletion beats addition, and
the shortest diff that fixes the *actual* problem wins: a bug fix is one guard where
all callers route through, not a guard per call site.

A pre-existing bug or unrelated improvement you notice mid-task is a follow-up in
your summary, not part of the change, unless the requested behaviour can't work
without it. Commit tests only where the repo already tests that kind of change,
sized like the neighbouring `*.test.ts`; scratch checks stay scratch.

## Tech Stack

- **Expo** (Router): one codebase for Web, iPadOS, iOS, Android.
- **Uniwind**: Tailwind for React Native (NativeWind replacement). https://docs.uniwind.dev
- **TanStack Query**: all fetching/mutations, every provider.
- **Effect**: typed errors, retries, structured concurrency for the provider
  service layer **only** (`lib/providers/`, `lib/http/`; tagged errors in
  `lib/providers/errors.ts`). **Containment rule:** Effect never leaks upward.
  `state/queries/*` runs it via `Effect.runPromise` inside `queryFn`/`mutationFn`;
  no `Effect<...>` in any component, screen, or hook signature. TanStack Query
  owns caching/invalidation/React state.
  Rationale: `docs/brainstorms/2026-07-07-effect-for-provider-layer.md`.
- **`react-native-mmkv`**: tokens and all local key/value state (web falls back to
  `localStorage`). Tokens use `encryptionKey` on native, never plaintext.
- **`react-native-nitro-fetch`**: native network client; web gets plain `fetch`.
  Both hide behind `lib/http/client.ts` + `client.web.ts`, so `state/queries/*`
  imports neither.
- **TMDB**: metadata source, **not** a tracker (no session, no registry entry,
  never a fan-out target). See "TMDB".
- **bun**: package manager, scripts, and `bun:test` (no Jest).
- **oxlint**: `bun lint`, config `.oxlintrc.json`.
- **React Compiler** auto-memoizes; `useMemo`/`useCallback` are lint-banned. Rare
  opt-out: `'use no memo'`, documented in the PR.

Prefer a [Nitro Modules](https://nitro.margelo.com) library over a bridge-based one
when one covers the need ([awesome-nitro-modules](https://nitro.margelo.com/docs/resources/awesome-nitro-modules)).
The app already needs a custom dev client, so native code is no new cost.

## Enforcement

Conventions that can be lint rules *are* lint rules. A new convention in this file
lands with its rule in the same PR.

- **`.oxlintrc.json`** owns the wrapper-import bans, the `useMemo`/`useCallback`
  ban, the effect-rx ban, the `@/` alias rule (never `../` across directories), and
  kebab-case filenames. Each message names the wrapper and why; read the config,
  not a list here. **Never import a wrapped library directly; go through
  `@/components/*` or `@/lib/*`.**
- **CI scripts** cover what oxlint can't: `bun check:classnames`,
  `bun check:router-push`, `bun check:links`.
- **Reviewer-enforced:** the Suspense/error-boundary rule, the no-dead-end-error
  rule, and the proxy invariants.

## Navigation

**Navigate with `usePushRoute()` (`@/lib/navigation`), never `useRouter().push`.**
pressto's debounce is per component instance, so two instances of one item (a show
is both a Continue Watching card and a Calendar cell), a sheet action over its card,
or a Suspense remount each push twice. `usePushRoute` drops a repeat of the same
href inside 700ms. `useRouter` stays for `back()`/`replace()`. Non-press navigation
opts out with `// push-guard-exempt: <reason>`. Enforced by `bun check:router-push`;
why: `docs/solutions/double-tap-pushes-two-detail-screens.md`.

## Native Builds (CNG)

`android/` and `ios/` are **generated, not committed** (`npx expo prebuild` from
`app.json` + config plugins + autolinking). Never hand-edit them; native changes go
in `app.json`, a config plugin, or a dependency choice.

**Always tell the user which one a change needs:** hot reload for anything under
`src/`, styles, JS assets; rebuild (`bun ios.clean` / `bun android.clean`) for
`app.json`, config plugins, or any dependency with native code. `pod install`
version-mismatch errors mean `ios/` is stale: clean-prebuild, never `pod update`
individual pods (`docs/solutions/pod-install-stale-podfile-lock.md`).

## Providers, Sessions & Log Fan-Out

- **Opt-in, per-provider sessions**, each through its own flow: Simkl PKCE
  (bundled client id, ~5-year tokens, no refresh grant, so a 401 is terminal and
  means reconnect), Trakt auth-code on BYO credentials, AniList implicit grant,
  Serializd WebView token capture (mobile) / email-password exchange (web).
  `state/session/` tracks who's connected. **`providerIsUsable`
  (`state/session/trakt-migration.ts`) is the single predicate gating every
  read/write leg**: a Trakt session with missing credentials is
  connected-but-unusable, drives the reconnect banner, and is never silently
  cleared.
- **Logging fans out.** `useLogMedia` takes a `NormalizedMediaItem` + intent and
  writes in parallel to every *connected* provider *applicable to that type*.
- **Routing isn't a 1:1 type map.** Movies → Trakt + Letterboxd + Simkl. TV →
  Trakt + Serializd + Simkl (TMDB-enriched anime *series* included). Anime →
  AniList + Simkl (AniDB episode numbering; writes ride the ani.zip remap, plan
  0027). Manga → AniList. Anime *films* are `ANIME` for AniList but a `MOVIE` for
  Trakt/Letterboxd: flagged by `isFilm` on `NormalizedMediaItem`, not a fifth
  `MediaType`, so they hit the movie targets plus Simkl and skip TV-only Serializd.
  All of it lives in `src/lib/providers/routing.ts` (pure, unit-tested); never
  inline `if (type === …)` / `if (provider === …)` at a call site.
- **Providers declare capabilities** in `src/lib/providers/registry.ts`: handled
  `MediaType`s, `canRead`, `canWrite`. Never assume symmetry (future domains are
  routinely read-only). Adding or degrading a provider means widening the
  `MediaType`/`ProviderId` unions and the registry, nothing else
  (`docs/plans/0005-provider-capability-model.md`).
- **Surface partial failure.** One provider's write failing while others succeed
  reaches the caller *as that provider*, never collapsed into a boolean/throw.
- **Never a dead-end error.** A structurally impossible write (`registry.ts`'s
  `unsupportedWritePlatforms`, e.g. Letterboxd on web) or any runtime failure/skip
  surfaces a manual deep link to that provider's page for the item via
  `providerItemUrl` (`lib/providers/external-urls.ts`, plan 0022).

**Letterboxd writes go through the authenticated native WebView session**
(`lib/providers/letterboxd/`), not an API key and not CSV (rejected 2026-07-15,
`docs/plans/0012-letterboxd-fallback-integration.md`). Its official write API is
request-only and excludes personal projects.

## TMDB

Primary metadata source for every detail screen
(`docs/plans/0014-tmdb-first-details.md`):

- `getMediaDetails` (`lib/providers/media-details.ts`) serves catalogue metadata +
  cast/crew/studios TMDB-first and **fails over to Trakt/AniList inside the
  effect** (no token, no TMDB id, request failure), never in a component.
- Display fields merge TMDB-over-provider via `applyPrimaryMetadata`
  (`lib/providers/merge-metadata.ts`). User state (progress, watched, seasons,
  logging) stays provider-sourced.
- Sole source for `/person/[id]` and `/studio/[id]` (TMDB id; provider entities
  without one resolve by name via `/lookup` siblings).
- Auth is the builder-supplied `EXPO_PUBLIC_TMDB_TOKEN` (v4 read token). Unset:
  detail screens fall back to provider paths, person/studio pages stay dark.
  Browser-callable (`docs/solutions/web-cors-tmdb.md`).

## Web & CORS

No backend, so on web the app calls provider APIs from the browser, which works
only where the provider sends CORS headers. **A provider that blocks browser
origins is native-only on web ("connect on mobile"), never proxied.** Spike from a
browser origin before building a web read path; record findings in
`docs/solutions/web-cors-*.md`. Simkl has wildcard CORS everywhere
(`docs/solutions/web-cors-simkl.md`); its rate-limit/write-lock discipline is
load-bearing (`docs/solutions/simkl-rate-limits-and-write-lock.md`).

**Two bounded exceptions exist. Don't add a third.** Each is a same-origin
Cloudflare Worker handler whose **invariant contract lives in its header docblock;
read it before editing**:

- `worker/serializd-proxy.ts`: path+method allowlist (exact-match additions only),
  `Authorization` only, no cookies, size/timeout caps, JSON forced.
- `worker/letterboxd-proxy.ts`: GET-only, unauthenticated, username-locked, HTML
  relayed under a script-killing CSP. **Never add a POST rule** without a fresh
  spike proving the Cloudflare fingerprint wall changed
  (`worker/letterboxd-write-spike.ts`, `docs/solutions/letterboxd-web-proxy.md`).

Both: no `Access-Control-Allow-Origin`, stateless, nothing logged. Web transports
hide behind each provider's injected fetch, so provider lib code never knows
whether it's talking to the origin or the relay.

**Local web dev needs the Worker too**: run `bun run dev:worker` (wrangler on :8787)
alongside `bun web`; restart `bun web` after `metro.config.js` edits
(`docs/solutions/local-web-dev-proxy-middleware.md`).

## Theming & Typography

Colors are theme tokens in `src/global.css` (Uniwind `@theme` / `@variant
light|dark`), never hex in a component; add a token instead, and both variants
define the same set: `background`, `surface`, `foreground`, `muted`, `border`,
`accent`, `accent-foreground`. `accent` is pinned to Vampiric Crimson (`#DC2626`)
in both themes (brand, not theme-adaptive). Dark is the designed-for mode, but
light must render *correctly*.

Fonts are tokens too: **Space Grotesk** (`font-display`, titles/headings) and
**Inter** (`font-sans`, `font-sans-semibold`), loaded in `app/_layout.tsx`. React
Native won't synthesize weights for custom fonts: **never combine
`font-bold`/`font-semibold` with a custom font class**; add a weight token and load
its font. The 忍 kanji intentionally falls back to the OS font.

## Class Names & Buttons

**Every composed `className` goes through `cn()`** (`@/lib/cn`), never a template
literal. A template literal emits `border-border border-accent` and lets the last
parser win; `cn` emits only `border-accent`, which is what lets `components/button`
accept caller layout classes without a variant explosion. Enforced by
`bun check:classnames`.

**Buttons are `components/button`**, never hand-rolled `PresstableOpacity` + `Text`.
`variant` (`primary` | `outline` | `quiet`) and `size` (`sm` | `md`) cover the app;
`className` is layout-only. Anything that awaits (OAuth, validation, a fan-out)
passes `loading`, never a label swap. A label that changes in place from user state
takes `morphLabel`.

`MorphText` (`components/morph-text`) is web-only enhancement with a native
fallback. Reserve it for text that *changes in place* from user state (progress
counts, the log button's episode number), not static text or high-frequency churn.

## Long Lists

Core surfaces are hundreds-to-thousands of media cards. Use `components/List`
(Legend List) for any data-driven list, never raw `FlatList`/`ScrollView`+`map`;
the web swap lives in `components/List/index.web.tsx`.

- **Recycling:** with `recycleItems`, item state must derive from props; local
  `useState`/`useRef` leaks into the recycled row. Leave it off unless a list
  measurably needs it.
- **Poster images go through `components/image`** (expo-image cache,
  `recyclingKey`); RN's core `Image` thrashes memory in long grids.

## Up Next & Timezones

A show is "up next" only once the episode has **actually aired in the user's local
timezone**, not the origin timezone and not a date-only compare. Provider air
fields are instants: parse with offset, convert to local, compare to now. The
comparison lives in `lib/time/has-aired.ts`, one utility, never per provider or
per screen.

## Notifications

Release notifications are **local-only, scheduled ahead** (~7–14 days on
foreground via expo-notifications, through `lib/time/has-aired.ts`). No push
server, ever; web gets the in-app Up Next feed only. The one permissible future
server is a *stateless* push relay, and only if local-schedule staleness proves
painful.

## Loading & Error States

Prefer Suspense + error boundaries over if-guard branching (`if (isLoading) return
<Skeleton/>`) in screens.

- **Section level:** `components/SuspenseSection`, a `<Suspense>` inside an error
  boundary that hides just that section and retries on `resetKey`
  (`src/app/details/[id].tsx`).
- **One boundary per independently-fetched section**, so a failing provider
  degrades to one skeleton row, not a blank feed (`features/feed/feed-rows.tsx`
  does this per carousel row).
- **App level:** `react-error-boundary` + `components/error-fallback` at the root;
  a screen needing its own fallback exports Expo Router's `ErrorBoundary`.
- Still legitimate: cross-provider aggregate status and mutations. Branching on
  *one* query's `isLoading`/`isError` is the smell this bans.

## Query Hook Conventions

- Read hooks are `useXQuery`, one per provider domain under `state/queries/`;
  Suspense variants `useSuspenseXQuery` sit next to their sibling as an addition.
- The write fan-out is the single `useLogMedia`; no per-provider log hooks in
  components.
- One query-key builder per domain (`createTraktQueryKey({…})`).
- Wrap token-bearing calls so a 401 triggers refresh before failing.

## Data Contract

All network responses normalize into `NormalizedMediaItem` (`types/media.ts`,
`plan.md` 2.2) before reaching components. Components never see raw payloads.

## File Conventions

Filenames are **kebab-case** across `src/` (lint-enforced); directories lowercase;
exported components PascalCase, hooks camelCase. Platform variants group into a
directory (`foo/index.tsx`, `foo/index.web.tsx`, `foo/index.native.tsx`), never a
lone suffixed file, and never a `require()` or conditional import branch.

## Compound Components

Parent/children implicit state (numbering, selection, grouping) is a
context-providing parent with subcomponents attached as properties, not
prop-drilled indices or config arrays. Reference: `src/components/steps.tsx`.
Promote an inline sub-layout once a second screen needs it.

## Golden Reference

Cross-platform structure: [bluesky-social/social-app](https://github.com/bluesky-social/social-app).
Adapt, don't copy: no backend/atproto here and a much smaller design system.
AniList: [lotusprey/otraku](https://github.com/lotusprey/otraku) (Flutter; patterns,
not code). Its auth flow is the model for AniList connect: embedded client id,
OAuth implicit grant, token parsed from the redirect fragment by a dedicated auth
route (`docs/plans/0011-anilist-integration.md`).

## Compound Knowledge

- `docs/plans/`: implementation blueprints, written before building.
- `docs/brainstorms/`: raw exploration notes.
- `docs/solutions/`: one file per solved bug or non-obvious pattern.
- `todos/`: work items, `NNN-status-priority-title.md`.
- `.agents/skills/`: vendored skills ([`skills` CLI](https://github.com/vercel-labs/skills),
  pinned in `skills-lock.json`; `.claude/skills` symlinks to it). Add with
  `bunx skills add <repo> --skill <name> -y -a claude-code`. Don't hand-edit; if one
  contradicts AGENTS.md, AGENTS.md wins and the skill goes.

**Every network anomaly or non-obvious fix gets written to `docs/solutions/`
immediately.** Any planning pass scans `docs/solutions/` first.
