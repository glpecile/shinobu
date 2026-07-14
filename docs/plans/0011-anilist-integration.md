---
status: in-progress
date: 2026-07-14
---

# 0011 — AniList Integration (todos/002) + Cross-Provider Anime Logging

## Context

Trakt is live end-to-end (plans 0006–0010). AniList lands as the second
symmetric provider: OAuth session, reads into `useUnifiedFeed`, and a write
adapter in the `useLogMedia` fan-out. Solutions scan done:
`web-cors-anilist.md` (GraphQL open to browsers, token endpoint blocked, real
rate limit 30 req/min) is the binding constraint on auth; nothing else under
`docs/solutions/` touches AniList yet.

Product requirements from this session (2026-07-14):

- Connecting AniList must be **more seamless than Trakt** — no credential
  pasting at all, modeled on [otraku](https://github.com/lotusprey/otraku)
  (see AGENTS.md Golden Reference).
- An anime that exists on both Trakt and AniList **logs to both**. If it is
  already logged on one and not the other, only the missing provider gets the
  write (catch-up, no duplicate). Once both are in the same state, logging
  again records a **rewatch** on both.
- Home feed reorders personal-first (Your Shows, Your Anime, then trending)
  and gains AniList-backed anime rows.
- The home header stops listing which providers are connected.
- Provider brand icons (Trakt/AniList/Letterboxd) appear on provider surfaces.

## Decisions

1. **Auth: implicit grant with an embedded client id, on every platform**
   (otraku's exact flow: `anilist.co/api/v2/oauth/authorize?client_id=N&
   response_type=token`, token returned in the redirect's **URL fragment**).
   - No BYO credentials — unlike Trakt (where BYO is intentional), AniList API
     clients have no approval gate and the implicit grant involves no secret,
     so Shinobu ships its own client id. One tap to connect.
   - AniList pins **exactly one redirect URL per client** and the authorize
     endpoint ignores any `redirect_uri` param, so there is one registered
     client per redirect target: native (`shinobu://redirect`) and web
     (`SHINOBU_WEB_DOMAIN`). Ids live in `lib/providers/anilist/config.ts`,
     selected by platform, overridable via `EXPO_PUBLIC_ANILIST_CLIENT_ID`
     (which is how localhost web dev works: a personal dev client whose
     redirect is `http://localhost:8081`).
   - Session is `{ accessToken, expiresAt }` — **no refresh token** (token
     lives ~1 year). A 401 clears the session; the only recovery is
     "reconnect AniList" (`ProviderAuthError { refreshFailed: true }`).
   - Web return leg: the generalized `use-oauth-callback` hook on the home
     route consumes `#access_token=…&expires_in=…` (fragment, AniList) next to
     `?code=…` (query, Trakt) and erases both from the URL. Fragments never
     reach the server — safe for static pre-rendering.
2. **Provider lib mirrors `trakt/`**: `lib/providers/anilist/{config,deps,
   http,normalize,reads,writes,index}.ts`, Effect-based with the shared
   `ProviderError` taxonomy, deps-injection without Layers, tests on fixtures.
   `anilistGraphQL<A>(deps, query, variables)` is the single transport:
   GraphQL-over-POST, 401 → `ProviderAuthError` (+ token clear — nothing to
   refresh), 429 → `ProviderRateLimitError` with `Retry-After`, GraphQL
   `errors[]` on a 200 → decode/auth error mapping. Budget: 30 req/min
   (`web-cors-anilist.md`) — keep feed reads to O(1) queries.
3. **Reads**: `getViewer` (id, cached ~forever under its own query key),
   `getCurrentAnime(viewerId)` (`MediaListCollection(type: ANIME, status:
   CURRENT)`), `getTrendingAnime` (public `Page.media(type: ANIME, sort:
   TRENDING_DESC)`). Normalization: `anilist-${id}`, `type: 'ANIME'`,
   `isFilm: format === 'MOVIE'`, title `english ?? romaji`, `averageScore/10`,
   `progressUnit: 'episode'`, `updatedAt` epoch-seconds → ISO instant.
4. **Writes**: `logToAniList(deps, item, opts)` via `SaveMediaListEntry` —
   films: `status: COMPLETED` (rewatch: `repeat + 1`); series episodes:
   `progress: n` (`status: CURRENT`, or `COMPLETED` when `n ==
   totalEpisodes`).
5. **Identity mapping: ani.zip** (`api.ani.zip/mappings`), the API face of the
   community anime-lists dataset (per this session's decision: mapping
   dataset over title search). Verified CORS-open
   (`docs/solutions/web-cors-anizip.md`), lookups by `anilist_id`,
   `thetvdb_id`, or `themoviedb_id`, and it also returns a per-episode
   absolute↔season/episode table for future multi-season support.
   `lib/providers/mapping/anizip.ts` exposes both directions; results cache
   under a TanStack key with `staleTime: Infinity` (mappings don't churn).
   It's treated as a mapping provider, not a media provider — no registry
   entry, errors degrade to "log to the origin provider only", surfaced via
   the existing partial-failure outcomes.
6. **Routing widens for anime, still declaration-driven**: `effectiveTypes`
   maps ANIME series → `['ANIME', 'TV']` and anime films → `['ANIME',
   'MOVIE']` (anime series are TV shows to Trakt); a TV/MOVIE item whose
   `externalIds.anilist` is populated (reverse-mapped) also matches ANIME
   providers. `useLogMedia` enriches `externalIds` through ani.zip before
   computing targets, so routing itself stays pure and unit-tested.
7. **Reconcile-then-write (the sync rule)** — `features/log-media/
   reconcile.ts`, pure + unit-tested. Per applicable provider, compare its
   current recorded state for the item (Trakt: watched movies/show progress;
   AniList: the `MediaList` entry):
   - Provider missing the watch (film unwatched / episode beyond its
     progress) → **write** (catch-up).
   - Provider already has it while another doesn't → **skip** (`in-sync`
     outcome, not an error) — never double-log the ahead provider.
   - Every applicable provider already has it (parity) → **rewatch on all**:
     Trakt gets a new `/sync/history` entry; AniList gets `repeat + 1`
     (films) / `status: REPEATING` with the episode's progress (series).
   Scope now: anime **films + single-season series** (AniList entries are
   per-season, so entry progress ≡ season-1 episode number). Multi-season
   absolute numbering defers to a follow-up using ani.zip's episode table.
8. **Feed**: rows become Your Shows, Your Anime (`status: CURRENT`), Trending
   Movies, Trending TV Shows, Trending Anime (public — anime renders before
   any connection, matching Trakt's trending rows). `use-unified-feed` keys
   results by row name instead of positional index now that the query list is
   conditional in two dimensions.
9. **Header**: the "Connected: …" subtitle is removed (connection state lives
   on the Manage Trackers screen); the header keeps just the wordmark +
   actions.
10. **Provider icons**: official simple-icons brand SVGs bundled under
    `assets/providers/*.svg`, rendered through the `components/image` wrapper
    (expo-image decodes SVG on iOS/Android and web — no react-native-svg, no
    rebuild). `components/provider-icon.tsx` maps `ProviderId` → asset; used
    on Manage Trackers rows and the log-confirm sheet's per-provider
    outcomes.
11. **Per-provider opt-out in the log sheet** (product note 2026-07-14): the
    confirm sheet renders a toggle row for every routed provider. Callers pass
    `selectedProviders` / `onSelectedProvidersChange`; the mutation accepts an
    optional `providers` override and filters routed targets to that subset.
    Default state is all targets selected.
12. **Anime detail parity with TV** (product note 2026-07-14): anime series
    details show the same stat-tile layout (Progress/Total/Total time) and a
    `Seasons` section. The section is backed by AniList's
    `airingSchedule`/`streamingEpisodes` and reuses the TV
    `SeasonAccordion`; episode progress/watched checkmarks come from the live
    entry state so they match what AniList already knows.
13. **Air-date gating for episodes** (product note 2026-07-14): both the TV
    season picker and the anime "Log next episode" button use
    `lib/time/has-aired.ts` so the user can never log an episode that hasn't
    aired in their local timezone. Anime episodes without an air date (common
    for catalogue entries) are treated as aired.

## Verification gates

- Unit (`bun test`): anilist normalize fixtures, GraphQL error mapping,
  implicit-grant fragment parsing, routing widening, reconcile matrix
  (unlogged/one-side/parity × film/episode), mapping response decode,
  anime episode normalization.
- Live: connect AniList in one tap on native + web dev client; Your Anime row
  renders; log an anime film → appears on both AniList and Trakt; log it
  again → Trakt plays+1 and AniList repeat+1; log an episode already on
  Trakt → only AniList written; the log sheet lets you uncheck Trakt so only
  AniList receives the write; an anime detail screen shows Progress/Total/
  Total time and a Seasons accordion; the "Log episode N" button is disabled
  until episode N has aired.
- Any GraphQL/paging/mapping surprise → `docs/solutions/anilist-*.md` before
  todos/002 closes.

## New dependencies

None. No native code changes — hot reload only (JS/TS + bundled assets).

## Out of scope

- Manga reads/writes UI (adapter handles MANGA typing but no manga feed row
  yet).
- Multi-season / absolute-numbering episode mapping (ani.zip episode table
  noted above).
- Letterboxd (todos/004), token encryption at rest (todos/003).
