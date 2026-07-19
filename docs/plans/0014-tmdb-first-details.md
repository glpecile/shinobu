# TMDB-first detail screens (providers as failover) + studio pages + UI polish

## Context

Follow-up to the person route (docs/plans/0013): TMDB becomes the **primary metadata source for detail screens**, with the tracker providers (Trakt/AniList) demoted to (a) user state — progress, watched marks, seasons, logging — which never changes source, and (b) **metadata failover** when TMDB can't serve (no token, no TMDB id, request failure). Also from this session:

- **Studio pages** (user request): studio pills on details navigate to a `/studio/[id]` page (TMDB company id) with the studio's works in rows.
- **Person meta line gains age** (user picked over unavailable "height" — TMDB has no height field).
- **Empty posters get a custom placeholder**: grey `bg-surface` tile with a centered 忍 kanji instead of the current black box (MediaCard + details poster).

User decisions: **TMDB-first everywhere, including anime credits** (AniList failover); uniform "one source of truth" rule.

What does NOT change: log fan-out, unified feed, search, seasons/episode lists + watched progress (Trakt), anime episode schedule (AniList), WatchedLine, stat tiles.

## 1. New TMDB reads + normalizers (`src/lib/providers/tmdb/`)

Add to `normalize.ts` (+ tests) and `reads.ts`, reusing `tmdbRequest`/`tmdbImageUrl` (extend `TmdbImageSize` with `'w300'` logos and `'w1280'` hero backdrops):

- **`getMediaCatalogue(deps, { kind: 'movie'|'tv', tmdbId })`** — one request: `/movie/{id}?append_to_response=credits` or `/tv/{id}?append_to_response=aggregate_credits` (aggregate = stable across seasons). Normalizes to:
  - `catalogue: NormalizedMediaItem` — id `tmdb-{kind}-{id}`, title, overview, poster `w342`, backdrop `w1280`, genre *names*, runtime (`runtime` / `episode_run_time[0]`), `rating` (0 ⇒ unrated, same rule as credits), year, `totalEpisodes` (tv `number_of_episodes`), `externalIds.tmdb`.
  - `cast: NormalizedCastMember[]` (top ~15 by billing; tv aggregate roles → characters joined) and `crew: NormalizedCrewMember[]` (one entry per person, jobs merged across departments à la `normalizeCrew` in `trakt/normalize.ts`, billing-ordered Directing/Writing/Production first, cap ~20). All members carry `tmdbId` → person cards link directly, no name-lookup hop.
  - `studios: NormalizedStudio[]` from `production_companies` — extend `NormalizedStudio` with `tmdbId?: number` (types/media.ts), id `tmdb-studio-{id}`.
- **`getStudio(deps, { tmdbId })`** — `Effect.all`: `/company/{id}` + `/discover/movie?with_companies={id}&sort_by=primary_release_date.desc` + `/discover/tv?with_companies=…` (page 1 each, ~20 items/row). Returns `{ company: NormalizedCompany, rows }` where `NormalizedCompany { tmdbId, name, logo (w300), headquarters?, homepage? }` and rows are `{ title: 'Movies'|'TV Shows', items: NormalizedMediaItem[] }` (empty rows dropped). Discover results normalize through a `kind`-explicit variant of the existing `normalizeCredit`.
- **`searchCompany(deps, { query })`** — `/search/company` → `{ tmdbId, name }[]`; reuse the generic `pickPersonMatch` for best-match (it's `<T extends { name: string }>` already).
- **`findByTvdbId(deps, { tvdbId })`** — `/find/{id}?external_source=tvdb_id` → first `tv_results` TMDB id or null. This is the anime-TV bridge: ani.zip gives most TV anime a TVDB id, not a TMDB one.

## 2. Cross-source composer — `src/lib/providers/media-details.ts` (+ test)

Pure Effect layer, deps-injected, **no RN imports** (bun-testable):

```ts
interface MediaDetailsDeps { tmdb: TmdbDeps | null; trakt: TraktDeps; anilist: AniListDeps }
interface MediaDetails {
  catalogue: NormalizedMediaItem | null; // TMDB record; null on provider fallback
  cast: NormalizedCastMember[]; crew: NormalizedCrewMember[]; studios: NormalizedStudio[];
  source: 'tmdb' | 'trakt' | 'anilist';
}
getMediaDetails(deps, { type, isFilm, tmdbId, traktId, anilistId }): Effect<MediaDetails, ProviderError>
```

- kind mapping: `TV → tv`, `MOVIE → movie`, `ANIME → isFilm ? movie : tv` (same `isFilm` reasoning as `routing.ts`).
- **TMDB path** when `deps.tmdb != null && tmdbId != null`; on *any* failure `Effect.catchAll` → provider path (failover is inside the effect, not a boundary concern).
- **Provider path**: `ANIME` + anilistId → `getAnimeCredits` (`anilist/credits.ts`, includes studios; catalogue null). `MOVIE/TV` + traktId → `Effect.all`: `getMediaPeople` + `getMediaStudios` (+ `getMediaImages` folded into a partial catalogue so the header art still recovers). Nothing available → empty `MediaDetails`.
- Failover matrix unit-tested with fake deps: tmdb success / tmdb 500→trakt / no token→anilist for anime / no ids→empty.

## 3. Merge semantics — `src/lib/providers/merge-metadata.ts` (+ tests)

New sibling `applyPrimaryMetadata(item, primary)`: **primary (TMDB) wins** for display fields when present (coverImage, backdropImage, overview, genres, rating, runtime, year); **fill-only** for progress-coupled `totalEpisodes` (provider totals drive progress UI); identity/user state (`id`, `type`, `currentProgress`, `lastUpdated`) and merged `externalIds` (item wins) stay as in `mergeCatalogueMetadata`.

## 4. Query layer

- **`src/state/queries/media-details.ts`** — `useMediaDetailsQuery(item)` (plain, header) + `useSuspenseMediaDetailsQuery(item)` (sections), same key/fn. Key includes `type` + the three external ids (enrichment that discovers an id refetches naturally). `queryFn`:
  1. Resolve `tmdbId`: `item.externalIds.tmdb`, else for ANIME run the existing `cachedAniZipIds` (`state/queries/mapping.ts`) → `.tmdb` (films) or `.tvdb` → new forever-cached `findByTvdbId` lookup (new `mappingQueryKeys.tmdbFind`).
  2. `Effect.runPromise(getMediaDetails({ tmdb: tmdbToken() ? tmdbDeps() : null, trakt: traktDeps(), anilist: anilistDeps() }, …))`.
- **`src/state/queries/tmdb.ts`** — add `studio(tmdbId)` / `studioRoot()` / `studioSearch(name)` keys + `useSuspenseTmdbStudioQuery` + `useSuspenseTmdbStudioSearchQuery` (same 24 h staleTime).
- Delete now-unused hooks after the screen rewrite: `useSuspenseTraktPeopleQuery`, `useSuspenseTraktStudiosQuery`, `useSuspenseAniListCreditsQuery` (their underlying reads stay — the composer uses them).

## 5. Details screen rewrite — `src/app/details/[id].tsx`

- **One credits path**: replace the `PeopleSections` / `AnimeCreditsSections` / `StudiosSection` type-branching with a single `CreditsSections` component on `useSuspenseMediaDetailsQuery(item)` rendering Cast + Crew rails and `StudiosList` under one `SuspenseSection` (they're one request now, same rule as the old anime path).
- **Header goes TMDB-first**: after the existing resolve/enrich chain, `const details = useMediaDetailsQuery(item)`; display item = `applyPrimaryMetadata(enrichedItem, details.data?.catalogue)`. `useTraktMediaImages` stays as the artless-fallback only.
- **Studio pills become pressable** (`PresstableOpacity`, token-gated like person cards): `tmdbId != null → routes.studio(tmdbId)`, else `routes.studioLookup(name)`.
- **`refresh()`**: drop the removed people/studios/credits keys; remove+refetch the media-details key instead.
- **Poster placeholder**: new `components/poster-placeholder.tsx` — `bg-surface border border-border` tile with a centered muted 忍 (kanji intentionally renders in the OS fallback font, per AGENTS.md). Used by the details poster (empty `artwork.coverImage`) and `MediaCard` when `coverImage === ''`.

## 6. Studio route — `src/app/studio/[id].tsx` + `src/app/studio/lookup.tsx`

Mirrors the person screens: `routes.studio(tmdbId)` / `routes.studioLookup(name)` in `lib/routes.ts`; header (logo or 忍 placeholder, name, headquarters), rows via `MediaCarousel` (`collapseKey` `studio-movies` / `studio-tv`), items push `routes.details(item.id)`; lookup suspends on company search → `pickPersonMatch` → `<Redirect>`. Reuse `PersonSkeleton`/`PersonNotFound` from `features/person` (they're layout-generic; keep location, note in code). Extend the details screen's `findInTmdbCreditsCache` to also scan `tmdbQueryKeys.studioRoot()` rows (both cached shapes expose `rows[].items`).

## 7. Person meta: age

`src/app/person/[id].tsx` `metaLine`: append computed age — `"Nov 12, 1980 (45)"`, or for the deceased `"Jul 3, 1937 – Mar 16, 2005 (67)"` (age at death). UTC-parse the bare dates (same rule as `formatDate`).

## 8. Docs + housekeeping

- `docs/plans/0014-tmdb-first-details.md` (this plan), AGENTS.md TMDB bullet updated: primary metadata source for detail screens, provider failover contract, studio route.
- If TMDB quirks surface (aggregate_credits shape, /find misses), record in `docs/solutions/`.

## Verification

1. `bun test` — new tests: tmdb catalogue/discover/company normalizers, composer failover matrix, `applyPrimaryMetadata`.
2. `bun typecheck` && `bun lint`.
3. `bunx expo export --platform web` (studio routes registered, bundle clean).
4. Manual (web + the existing iOS dev client — all JS-only, hot reload):
   - Trakt-sourced movie/TV details: cast/crew/studios come from TMDB (person links direct, no lookup hop); pull-to-refresh re-suspends correctly.
   - Anime details: credits via TMDB (ani.zip→TVDB→/find bridge); an anime with no TMDB mapping falls back to AniList credits.
   - With `EXPO_PUBLIC_TMDB_TOKEN` removed: everything renders exactly as before the rewrite (Trakt/AniList paths).
   - Studio pill → studio page rows → tap a work → details resolves; AniList studio pill → lookup → studio page.
   - Person page shows age; artless cards/posters show the grey 忍 placeholder.

## Out of scope

- Feed/search/logging surfaces; seasons and progress stay provider-sourced.
- BYO TMDB key settings UI (still env-only).
