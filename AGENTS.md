# Shinobu Agent Conventions

Shinobu (忍): DB-less, cross-platform media tracker. Simkl, Trakt, AniList,
Letterboxd, and Serializd are **symmetric, opt-in providers** — not a primary store
with satellite imports. Log media once; Shinobu writes it out to every connected
provider it applies to. Reads aggregate the connected providers into one feed.
No Shinobu account, no backend, no DB — a provider's token *is* its session.

Simkl "just works" (bundled client id, one-tap PKCE). **Trakt is
bring-your-own-everything** — the app ships no Trakt credentials; it activates only
once the user registers their own API app and enters client id *and* secret
(`docs/plans/0034-simkl-provider-and-trakt-detachment.md`). Don't re-propose a
bundled Trakt key.

Product vision + architecture: `plan.md` (1.2, 1.3, 2.1).

## Scope

**YAGNI.** Build what the task asks for, nothing for "later": no interface with one
implementation, no factory for one product, no config for a value that never
changes, no scaffolding a future PR can write for itself. Reuse what's already in
the repo before adding anything; reach for the platform or an installed dependency
before a new one. Deletion beats addition, and the shortest diff that fixes the
*actual* problem wins — a bug fix is one guard where all callers route through, not
a guard per call site. Speculative generality gets removed in review.

## Tech Stack

- **Expo** (Router) — one codebase for Web, iPadOS, iOS, Android.
- **Uniwind** — Tailwind for React Native (drop-in NativeWind replacement, by the
  Unistyles team). https://docs.uniwind.dev
- **TanStack Query** — all fetching/mutations, across every provider.
- **Effect** — typed errors, retries, structured concurrency for the provider
  service layer **only** (`lib/providers/`, `lib/http/`; tagged errors in
  `lib/providers/errors.ts`). **Containment rule:** Effect never leaks upward.
  `state/queries/*` runs it at the boundary via `Effect.runPromise` inside
  `queryFn`/`mutationFn` — no `Effect<...>` in any component, screen, or hook
  signature, and never run Effect inside a component. TanStack Query keeps
  caching/invalidation/React state.
  Rationale: `docs/brainstorms/2026-07-07-effect-for-provider-layer.md`.
- **`react-native-mmkv`** — persisted tokens and all local key/value state. Web
  falls back to `localStorage`, so it stays universal. Use MMKV's `encryptionKey`
  for tokens on native, never plaintext.
- **`react-native-nitro-fetch`** — network client on native only (no web build).
  Web gets plain `fetch`; both sit behind `lib/http/client.ts` +
  `lib/http/client.web.ts`, so `state/queries/*` imports neither directly.
- **TMDB** — metadata source, **not** a tracker: no session, no registry entry,
  never a fan-out target. See "TMDB" below.
- **bun** — package manager and script runner. Tests are `bun:test` — no Jest.
- **oxlint** — `bun lint`, config `.oxlintrc.json`. See "Enforcement" below.
- **React Compiler** — auto-memoizes, so `useMemo`/`useCallback` are lint-banned.
  Rare opt-out: `'use no memo'` on that component, documented in the PR.

Prefer a [Nitro Modules](https://nitro.margelo.com) library over a bridge-based one
whenever one exists and covers the need (check
[awesome-nitro-modules](https://nitro.margelo.com/docs/resources/awesome-nitro-modules)).
Tradeoff: native code means no plain Expo Go — already true here, the app needs a
custom dev client.

## Enforcement

Conventions that can be lint rules *are* lint rules, not prose. When a new
convention lands in this file, add the rule in the same PR.

- **`.oxlintrc.json`** owns the wrapper-import bans (pressto, `@legendapp/list`,
  expo-image, galeria, torph, sonner, cnfast, reanimated, keyboard-controller,
  sheet, haptics, vector-icons, …), the `useMemo`/`useCallback` ban, the effect-rx
  ban, and kebab-case filenames. Each message names the wrapper to use and why —
  **never import a wrapped library directly; go through `@/components/*` or
  `@/lib/*`.** Read the config rather than trusting a list here to stay current.
- **Import alias:** cross-directory imports use `@/`, never `../` (lint-enforced).
- **CI scripts** cover what oxlint can't (it has no `no-restricted-syntax`):
  `bun check:classnames`, `bun check:router-push`, `bun check:links`.
- **Reviewer-enforced** (not mechanizable): the Suspense/error-boundary rule, the
  no-dead-end-error rule, and the proxy invariants.

## Navigation

**Navigate with `usePushRoute()` (`@/lib/navigation`), never `useRouter().push`.**
pressto's debounce is per-component-instance and does not protect the global
navigation stack: two instances of one item (a show is both a Continue Watching
card and a Calendar cell), a sheet action over the card that opened it, or a
Suspense remount each push twice without any pressable being pressed twice.
`usePushRoute` drops a repeat of the same href inside 700ms. `useRouter` stays the
way to `back()`/`replace()`. Non-press navigation opts out with a
`// push-guard-exempt: <reason>` comment. Enforced by `bun check:router-push`.
Why: `docs/solutions/double-tap-pushes-two-detail-screens.md`.

## Native Builds (CNG)

`android/` and `ios/` are **generated, not committed** — produced by
`npx expo prebuild` from `app.json` + config plugins + autolinking. Never hand-edit
them; the next `--clean` wipes it. Native changes belong in `app.json`, a config
plugin, or a dependency choice.

**Always tell the user which one a change needs:**

- **Hot reload:** anything under `src/`, styles, JS-bundle assets.
- **Rebuild (`bun ios.clean` / `bun android.clean`):** `app.json` edits, config
  plugins, and adding/removing/upgrading any dependency that ships native code.
- **`pod install` version-mismatch errors** mean `ios/` is stale — clean-prebuild.
  Never `pod update` individual pods
  (`docs/solutions/pod-install-stale-podfile-lock.md`).

## Providers, Sessions & Log Fan-Out

- **Opt-in, per-provider sessions.** A user connects any subset of {Simkl, Trakt,
  AniList, Letterboxd, Serializd} through that provider's own flow — OAuth (Simkl
  PKCE, bundled client id, ~5-year tokens with no refresh grant so a 401 is
  terminal → reconnect; Trakt auth-code on BYO credentials), or Serializd's WebView
  token capture (mobile) / email-password exchange (web). `state/session/` tracks
  who's connected, mirroring bluesky-social's `state/session`.
  **`providerIsUsable` (`state/session/trakt-migration.ts`) is the single predicate
  gating every read/write leg** — a Trakt session whose credentials are gone is
  connected-but-unusable, drives the reconnect banner, and is never silently
  cleared.
- **Logging fans out.** `useLogMedia` takes a `NormalizedMediaItem` + intent and
  writes in parallel to every *connected* provider *applicable to that type* —
  never a single-provider write.
- **Routing isn't a 1:1 type map.** Movies → Trakt + Letterboxd + Simkl. TV →
  Trakt + Serializd + Simkl (a TMDB-enriched anime *series* included). Anime →
  AniList + Simkl (Simkl tracks anime natively, AniDB episode numbering — writes
  ride the ani.zip remap from plan 0027). Manga → AniList. Anime *films* are the
  edge case: `ANIME` in AniList but a `MOVIE` for Trakt/Letterboxd — flagged by
  `isFilm` on `NormalizedMediaItem`, not a fifth `MediaType` — so they hit the movie
  targets plus Simkl (which files them under anime with MAL ids), excluding
  TV-only Serializd. All of it lives in `src/lib/providers/routing.ts` (pure,
  unit-tested) — never inline `if (type === …)` / `if (provider === …)` at a call
  site.
- **Providers declare capabilities.** `src/lib/providers/registry.ts` is the single
  registry: which `MediaType`s a provider handles, `canRead`, `canWrite`. Never
  assume symmetry — future domains (games, books, music) are routinely read-only.
  Adding or degrading a provider means widening the `MediaType`/`ProviderId` unions
  and the registry, nothing else
  (`docs/plans/0005-provider-capability-model.md`).
- **Surface partial failure.** One provider's write failing while others succeed
  must reach the caller *as that provider* — never collapsed into a boolean/throw.
- **Never a dead-end error.** A structurally impossible write (`registry.ts`'s
  `unsupportedWritePlatforms`, e.g. Letterboxd on web) or any runtime failure/skip
  surfaces a manual deep link to that provider's page for the item, built by
  `providerItemUrl` (`lib/providers/external-urls.ts`, plan 0022).

**Letterboxd writes go through the authenticated native WebView session**
(`lib/providers/letterboxd/`), not an API key and not CSV — the CSV write path was
evaluated and rejected 2026-07-15 (`docs/plans/0012-letterboxd-fallback-integration.md`).
Its official write API exists but is request-only and excludes personal projects.

## TMDB

Primary metadata source for every detail screen
(`docs/plans/0014-tmdb-first-details.md`):

- `getMediaDetails` (`lib/providers/media-details.ts`) serves catalogue metadata +
  cast/crew/studios TMDB-first and **fails over to Trakt/AniList inside the
  effect** (no token, no TMDB id, request failure) — never in a component.
- Display fields merge TMDB-over-provider via `applyPrimaryMetadata`
  (`lib/providers/merge-metadata.ts`). User state — progress, watched, seasons,
  logging — stays provider-sourced.
- Sole source for `/person/[id]` and `/studio/[id]` (keyed by TMDB id;
  provider-sourced entities without one resolve by name via `/lookup` siblings).
- Auth is the builder-supplied `EXPO_PUBLIC_TMDB_TOKEN` (v4 read token). Unset →
  detail screens fall back to provider paths and person/studio pages stay dark.
  Browser-callable (`docs/solutions/web-cors-tmdb.md`).

## Web & CORS

No backend, so on web the app calls provider APIs straight from the browser — which
works only where the provider sends CORS headers. **A provider that blocks browser
origins is native-only on web ("connect on mobile"), never proxied.** Verify with a
browser-origin spike before building a web read path; record findings in
`docs/solutions/web-cors-*.md`. Simkl is the easy case — wildcard CORS on API, CDN,
and token endpoint (`docs/solutions/web-cors-simkl.md`); its rate-limit/write-lock
discipline is load-bearing
(`docs/solutions/simkl-rate-limits-and-write-lock.md`).

**Two bounded exceptions exist. Don't add a third.** Each is a same-origin
Cloudflare Worker handler whose **full invariant contract lives in the handler's
own header docblock — read it before editing**:

- `worker/serializd-proxy.ts` — path+method allowlist, `Authorization` only, no
  cookies, size/timeout caps, JSON forced. Allowlist additions are exact-match,
  never prefixes.
- `worker/letterboxd-proxy.ts` — GET-only, unauthenticated, username-locked, HTML
  relayed under a script-killing CSP. **Never add a POST rule** without a fresh
  spike proving the Cloudflare fingerprint wall changed
  (`worker/letterboxd-write-spike.ts`, `docs/solutions/letterboxd-web-proxy.md`).

Both: no `Access-Control-Allow-Origin`, stateless, nothing logged. Web transports
hide behind each provider's injected fetch, so provider lib code never knows
whether it's talking to the origin or the relay.

**Local web dev needs the Worker too** — `/api/*` doesn't exist on Metro. Run
`bun run dev:worker` (wrangler on :8787) alongside `bun web`; restart `bun web`
after `metro.config.js` edits
(`docs/solutions/local-web-dev-proxy-middleware.md`).

## Theming & Typography

Colors are theme tokens in `src/global.css` (Uniwind `@theme` / `@variant
light|dark`), never hardcoded hex in a component — add a token instead. Both
variants must define the same set. Tokens: `background`, `surface`, `foreground`,
`muted`, `border`, `accent`, `accent-foreground`. `accent` is pinned to Vampiric
Crimson (`#DC2626`) in both themes — brand, not theme-adaptive. Dark is the
designed-for mode, but light must render *correctly*, not just "not crash."

Fonts are tokens too: **Space Grotesk** (`font-display` — titles, headings) and
**Inter** (`font-sans`, `font-sans-semibold`), loaded in `app/_layout.tsx`. React
Native won't synthesize weights for custom fonts — **never combine `font-bold`/
`font-semibold` with a custom font class**; add a weight token and load its font.
The 忍 kanji intentionally falls back to the OS font.

## Class Names & Buttons

**Every composed `className` goes through `cn()`** (`@/lib/cn`) — never a template
literal:

```tsx
// no
className={`px-4 py-2 border border-border ${active ? 'bg-accent' : ''}`}
// yes
className={cn('px-4 py-2 border border-border', active && 'bg-accent')}
```

Conflict resolution is the reason, not readability: a template literal emits
`border-border border-accent` and lets the last parser win, while `cn` emits only
`border-accent` — which is what lets `components/button` accept caller layout
classes without a variant explosion. Enforced by `bun check:classnames`.

**Buttons are `components/button`**, never hand-rolled `PresstableOpacity` + `Text`
— that's how `rounded` ended up next to `rounded-md` and how "Connecting…" shipped
without a spinner. `variant` (`primary` | `outline` | `quiet`) and `size`
(`sm` | `md`) cover the app; `className` is layout-only. Anything that awaits
(OAuth, validation, a fan-out) passes `loading`, never a label swap. A label that
changes in place from user state takes `morphLabel`.

`MorphText` (`components/morph-text`) is web-only enhancement — it morphs on
native-safe fallback. Reserve it for text that *changes in place* from user state
(progress counts, the log button's episode number); not static/mount-time text
(first render never animates), not high-frequency churn.

## Long Lists

Every core surface (feed, library grids, Up Next) is hundreds-to-thousands of media
cards. Use the `components/List` wrapper (Legend List) for any data-driven list,
never raw `FlatList`/`ScrollView`-with-`map`. Wrapping it once means a web-specific
swap (`components/List/index.web.tsx`) needs no call-site changes.

- **Recycling gotcha:** with `recycleItems`, item components are reused across rows
  — item state must derive from props; local `useState`/`useRef` leaks into the row
  it recycles into. Leave recycling off unless a list measurably needs it.
- **Poster images go through `components/image`** (expo-image: memory/disk cache,
  `recyclingKey`). Long grids through RN's core `Image` thrash memory on mobile.

## Up Next & Timezones

A show is "up next" only once the episode has **actually aired in the user's local
timezone** — not the origin timezone, not a date-only compare. Provider air fields
(Trakt, AniList `airingSchedule`) are instants: parse with offset info, convert to
local, compare to now. Getting it wrong spoils an unaired episode or hides an aired
one. The comparison lives in `lib/time/has-aired.ts` — one utility, never per
provider or per screen.

## Notifications

Release notifications are **local-only, scheduled ahead** — air dates are known in
advance, so on foreground schedule the next ~7–14 days via expo-notifications.
No push server, ever; scheduling goes through `lib/time/has-aired.ts`. Web gets the
in-app Up Next feed only. The one permissible future server exception is a
*stateless* push relay, and only if local-schedule staleness proves painful.

## Loading & Error States

Prefer Suspense + error boundaries over if-guard branching (`if (isLoading) return
<Skeleton/>`) in screens — the happy path stays unindented and each failure sits
with the section it affects.

- **Section level:** `components/SuspenseSection` — a `<Suspense>` (skeleton
  fallback) inside an error boundary that hides just that section and retries on
  `resetKey`. See `src/app/details/[id].tsx`.
- **Granularity preserves partial failure.** One boundary per independently-fetched
  section, so a failing provider degrades to one skeleton row, not a blank feed —
  the same contract as the write fan-out. The home feed does this per carousel row
  (`features/feed/feed-rows.tsx`).
- **App level:** `react-error-boundary` + `components/error-fallback` at the root;
  a screen needing its own full-screen fallback exports Expo Router's
  `ErrorBoundary`.
- Still legitimate: cross-provider aggregate status ("some content could not be
  loaded") and mutations. Branching on *one* query's `isLoading`/`isError` is the
  smell this bans.

## Query Hook Conventions

- Read hooks are `useXQuery` (`useWatchedShowsQuery`), one per provider domain
  under `state/queries/`. Suspense variants are `useSuspenseXQuery`, in the same
  file next to their sibling — an addition, never a replacement.
- The write fan-out is the single `useLogMedia` — no per-provider log hooks called
  from components.
- One query-key builder per domain (`createTraktQueryKey({…})`).
- Wrap token-bearing calls so a 401 triggers refresh before failing.

## Data Contract

All network responses normalize into `NormalizedMediaItem` (`types/media.ts`,
`plan.md` 2.2) before reaching components. Components never see raw provider
payloads.

## File Conventions

Filenames are **kebab-case** across `src/` (lint-enforced); directories lowercase.
Exported components stay PascalCase, hooks camelCase — the rule is on the filename.

Platform variants group into a directory, never a lone suffixed file — the bundler
resolves them, so never branch on `require()` or a conditional import:

```
components/foo/index.tsx        # shared/default
components/foo/index.web.tsx    # web-only
components/foo/index.native.tsx # iOS + Android
```

## Compound Components

A shared component with parent/children implicit state (numbering, selection,
grouping) is built compound-style: a context-providing parent with subcomponents
attached as properties, not prop-drilled indices or config arrays. Reference:
`src/components/steps.tsx` — `<Steps>` auto-numbers its `<Steps.Item>` children, so
reordering touches no call site. Promote an inline sub-layout once a second screen
needs it.

## Golden Reference

For cross-platform structure, default to
[bluesky-social/social-app](https://github.com/bluesky-social/social-app) — the most
mature open-source universal Expo app. Adapt, don't copy: Shinobu has no
backend/atproto and a much smaller design system.

For AniList, the reference is
[lotusprey/otraku](https://github.com/lotusprey/otraku) (Flutter — patterns, not
code). Its auth flow is the model for Shinobu's AniList connect: app-owned embedded
client id, OAuth **implicit grant** (`response_type=token`, no secret), token parsed
from the redirect fragment by a dedicated auth route
(`docs/plans/0011-anilist-integration.md`).

## Compound Knowledge

- `docs/plans/` — implementation blueprints, written before building.
- `docs/brainstorms/` — raw exploration notes.
- `docs/solutions/` — one file per solved bug or non-obvious pattern.
- `todos/` — work items, `NNN-status-priority-title.md`.
- `.agents/skills/` — vendored agent skills ([`skills` CLI](https://github.com/vercel-labs/skills),
  pinned in `skills-lock.json`); `.claude/skills` symlinks to it. Add with
  `bunx skills add <repo> --skill <name> -y -a claude-code`. Don't hand-edit them;
  if one contradicts AGENTS.md, AGENTS.md wins — remove the skill.

**Every network anomaly or non-obvious fix gets written to `docs/solutions/`
immediately** — rate limits, pagination mismatches, OAuth refresh edges, GraphQL
quirks. Don't just fix the code. Any planning pass scans `docs/solutions/` first,
before proposing a refactor or integration.
