---
status: in-progress
date: 2026-07-07
---

# 0006 — Trakt Provider: OAuth, Read Path, Write Adapter (todos/001)

## Context

First real provider integration and the **Effect pilot**
(`docs/brainstorms/2026-07-07-effect-for-provider-layer.md`): Trakt exercises
OAuth, refresh, read, write, and normalization on one provider before the fan-out
(`todos/005`) commits to the pattern. Solutions scan done: `web-cors-trakt.md`
(Trakt is fully browser-callable, API *and* token endpoint — web needs no
special-casing) and `web-cors-anilist.md` (irrelevant here, but constrains the
session shape: AniList-on-web will have no refresh token, so `refreshToken` must
be optional in the shared session type).

## Decisions

1. **OAuth = authorization code via `expo-auth-session`, same flow on all
   platforms.** Trakt has no PKCE; token exchange requires `client_secret`
   embedded in the bundle — normal for Trakt's ecosystem (documented in
   `web-cors-trakt.md`). `usePKCE: false`. The *exchange* and *refresh* POSTs go
   through our own provider layer (typed errors), not `exchangeCodeAsync`, so
   auth failures share the `ProviderError` taxonomy. Credentials come from
   `EXPO_PUBLIC_TRAKT_CLIENT_ID` / `EXPO_PUBLIC_TRAKT_CLIENT_SECRET`
   (`.env`, gitignored; `.env.example` committed). Redirect URI:
   `makeRedirectUri({ path: 'oauth/trakt' })` → `shinobu://oauth/trakt` native,
   `<origin>/oauth/trakt` web — both registered in the Trakt app settings.
2. **HTTP layer** per AGENTS.md: `lib/http/client.ts` re-exports nitro-fetch's
   WHATWG-compatible `fetch`; `client.web.ts` re-exports the browser's. One
   `HttpFetch` type; nothing above `lib/` imports either file directly.
3. **Session storage**: one MMKV instance (`createMMKV({ id: 'session' })`),
   key `session.<providerId>`, JSON `ProviderSession { accessToken,
   refreshToken?, expiresAt? }`. `refreshToken`/`expiresAt` optional (AniList
   implicit grant, above). Reactivity via `useMMKVListener` — no bespoke context
   state to keep in sync with storage. Encryption is explicitly deferred to
   `todos/003`.
4. **Dependency injection without Layers** (per the brainstorm's "keep surface
   area small"): every Trakt effect takes a `TraktDeps { fetch: HttpFetch;
   tokens: TokenStore }` first argument. Tests inject fakes; `state/queries/`
   wires the real modules once. No `Layer`/`Context` until a third provider
   makes the boilerplate hurt.
5. **Request wrapper contract** (`traktRequest`): sets the three mandatory
   headers (`Content-Type`, `trakt-api-version: 2`, `trakt-api-key`), attaches
   `Authorization` when a session exists, then maps: 401 → refresh once via
   `Effect.catchTag('ProviderAuthError')` and retry, refresh failure →
   `ProviderAuthError { refreshFailed: true }` (UI: "reconnect Trakt");
   429 → `ProviderRateLimitError { retryAfterMs }` from `Retry-After`, retried
   once after sleeping; malformed JSON → `ProviderDecodeError`; transport →
   `ProviderNetworkError`.
6. **Read path**: `GET /sync/watched/shows?extended=full,images` →
   `NormalizedMediaItem[]` (`type: 'TV'`, `currentProgress` = watched-episode
   count summed from `seasons[].episodes`, `totalEpisodes` = `show.aired_episodes`,
   `lastUpdated` = `last_watched_at` (already an ISO instant), `coverImage` from
   `images.poster[0]` with `''` fallback — Trakt's `extended=images` is new-ish;
   verify against the live API once credentials exist and log a solution if it
   misbehaves). Hook: `useWatchedShowsQuery` in `state/queries/trakt.ts`,
   `enabled` only while Trakt is connected, `queryFn` = `Effect.runPromise`
   (the containment boundary).
7. **Write adapter**: `logToTrakt(deps, item, intent)` posting to
   `/sync/history` — movies by `ids` (trakt/tmdb preferred), episodes by
   show ids + `seasons[].episodes[]`. Registered shape matches what
   `todos/005`'s `useLogMedia` will call; no UI trigger in this todo.
8. **UI-first scope (user re-prioritization, 2026-07-07)**: this plan ships a
   *visible* product slice, not just plumbing —
   - **Movie catalogue**: `GET /movies/trending?extended=full,images` is public
     (client id header only, no OAuth) → a browsable catalogue screen renders
     real data before login exists. Same normalization pipeline as the watched
     path, so it doubles as live verification of decision 6.
   - **Onboarding/connect experience** (pulls the core of `todos/009`
     forward): first run shows a connect screen rendered *from the registry*
     (not hardcoded); connecting Trakt flows into the catalogue + watched feed;
     disconnect clears the token. Letterboxd renders its blocked state
     honestly.
   - **Media card + list**: `components/List` wrapper (Legend List, per
     AGENTS.md) and a Uniwind-styled `MediaCard` with `expo-image` posters —
     plan.md 3.2's blueprint modernized to conventions.
9. **UI tests under `bun:test`** (user priority): component tests via
   `react-native-web` + `@testing-library/react` + `happy-dom`, with a Bun
   resolver plugin (test preload) aliasing `react-native` →
   `react-native-web` and stubbing Metro-only/native-only modules
   (`expo-image`, router). Uniwind's `className` is a Metro-time transform, so
   tests assert *behavior and content* (what renders, what handlers fire, what
   the registry-driven connect screen lists), never styles. If this harness
   fights back, the fallback is documented in `docs/solutions/` and tests drop
   to component-logic level — not silently skipped.

## Verification gates

- Unit: normalization fixtures, 401→refresh→retry, refresh-fail taxonomy,
  429 Retry-After mapping, write payload shapes — `bun test`, no network.
- Live (blocked on user-registered Trakt app credentials): OAuth on web +
  one native platform, real watched-shows fetch, one real write.
- Any live-API surprise (rate limits, images shape, pagination) →
  `docs/solutions/trakt-*.md` **before** closing `todos/001`.

## New dependencies

`expo-auth-session` + `expo-crypto` + `expo-web-browser` (Expo SDK modules,
ship native code → dev-client rebuild required: `bun ios.clean` /
`bun android.clean`).
