# Person route (cast/crew details) + image zoom

## Context

The details screen (`src/app/details/[id].tsx`) renders cast/crew as static `PersonCard`s. Goal: pressing a person card opens a **person route** showing who they are plus their previous work in horizontal rows grouped by role (Acting, Directing, Writing, …). Additionally (mid-session request): pressing the poster on the details page — and the headshot on the new person page — zooms the image via [`@nandorojo/galeria`](https://github.com/nandorojo/galeria).

**User decisions:**
- **TMDB is the single source of truth** for the person route (bio + credits). The route is keyed by TMDB person id only — no `anilist-person-*` / `trakt-person-*` union handling in the view.
- **AniList-sourced people** (anime voice actors/staff, which carry no TMDB id) **resolve by name search** on TMDB when tapped.
- Galeria zoom on the details poster and the person headshot.

TMDB here is a **metadata source, not a tracker provider** (like `lib/providers/mapping/anizip.ts`): no `ProviderId` widening, no registry/session changes.

## 1. TMDB access + CORS

- Auth via **`EXPO_PUBLIC_TMDB_TOKEN`** (TMDB v4 Read Access Token, `Authorization: Bearer` header) — builder-supplied env var, same model as `EXPO_PUBLIC_TRAKT_CLIENT_ID` (`src/lib/providers/trakt/config.ts`). A BYO in-app settings field is a later follow-up, not in scope.
- When the token is empty, person cards render non-pressable (feature dark, nothing errors).
- Per Web & CORS convention: probe `api.themoviedb.org` with a browser `Origin` header (curl) and record findings in `docs/solutions/web-cors-tmdb.md` before relying on the web path. (TMDB is expected to pass — it sends `access-control-allow-origin: *`.)

## 2. TMDB provider module — `src/lib/providers/tmdb/` (Effect layer)

Mirror the Trakt module's shape (deps injection, no Effect Layers; tagged errors from `lib/providers/errors.ts`):

- `config.ts` — `TMDB_API_BASE_URL` (`https://api.themoviedb.org/3`), `tmdbToken()` from env, image URL helpers over `https://image.tmdb.org/t/p/` (`w342` posters, `w185` grid headshots, `original` for the zoomable headshot).
- `deps.ts` — `TmdbDeps { fetch: HttpFetch; token: string }`.
- `api.ts` — `tmdbRequest<T>(deps, path)`: GET + Bearer header → JSON, mapped into the existing tagged `ProviderError`s (follow `trakt/api.ts` incl. its rate-limit/backoff handling).
- `reads.ts`:
  - `getPerson(deps, { tmdbId })` → **one request**: `/person/{id}?append_to_response=combined_credits` → `{ person: NormalizedPerson; rows: PersonCreditRow[] }`.
  - `searchPerson(deps, { query })` → `/search/person?query=…` (for the name-lookup path).
- `normalize.ts` (+ `normalize.test.ts`, bun:test):
  - Person: name, headshot, biography, birthday/deathday, birthplace, `knownForDepartment`.
  - Credits → rows: `cast` array becomes the **"Acting"** row; `crew` entries group by their `department` field into one row each. Row order: `known_for_department` row first, then by item count. Within a row: dedupe by media id (merge character/job strings — TMDB repeats a show per role), sort by release/first-air date desc, undated (upcoming) first.
  - Each credit → `NormalizedMediaItem`: id `tmdb-movie-{id}` / `tmdb-tv-{id}`, type `MOVIE`/`TV`, `coverImage` from poster path (or `''`), `externalIds.tmdb`, `currentProgress: 0`, `lastUpdated` from injected now-ISO (Clock pattern as in `trakt/reads.ts`).
  - `pickPersonMatch(results, name)` — exact case-insensitive name match preferred, else highest-popularity hit, null on empty; unit-tested (the people analog of `pick-movie-match.ts`, per `docs/solutions/trakt-text-search-wrong-movie-match.md`).

## 3. Types — `src/types/media.ts`

- Add `NormalizedPerson` and `PersonCreditRow { role: string; items: NormalizedMediaItem[] }`.
- Add `tmdbId?: number` to `NormalizedCastMember` and `NormalizedCrewMember`; populate it in `trakt/normalize.ts` (`normalizeCastEntry`, `normalizeCrew`) from `person.ids.tmdb`. AniList people keep it absent → they take the name-lookup path.

## 4. Queries — `src/state/queries/tmdb.ts`

Effect runs only at the boundary (`Effect.runPromise` in `queryFn`), matching `state/queries/trakt.ts`:

- `tmdbQueryKeys = { all, person(id), personSearch(name) }`.
- `tmdbDeps()` wiring `httpFetch` + `tmdbToken()`.
- `useSuspenseTmdbPersonQuery({ tmdbId })`, `useSuspenseTmdbPersonSearchQuery({ name })`. Long `staleTime` (person data barely churns).

## 5. Routes + screens

`src/lib/routes.ts`: add `person: (tmdbId) => /person/${tmdbId}` and `personLookup: (name) => /person/lookup?name=${encodeURIComponent(name)}`.

- **`src/app/person/[id].tsx`** — the person screen:
  - Header: Galeria-zoomable headshot (initials fallback as on `PersonCard`), name, meta line (known-for dept · birthday · birthplace), biography with the Read-more clamp.
  - Extract the existing `Overview` component out of `details/[id].tsx` into **`src/components/expandable-text.tsx`** and reuse it in both screens (it's a measured two-line clamp worth keeping single-sourced).
  - Credit rows reuse **`components/media-carousel.tsx`** (`MediaCarousel`) under a `SuspenseSection` with a rail skeleton; `onItemPress` → `router.push(routes.details(item.id))`. `collapseKey` per role (e.g. `person-acting`) so collapse prefs are per-role, not per-person.
  - `Head` title, back button, and route-level `ErrorBoundary` export as on the details screen.
- **`src/app/person/lookup.tsx`** — name resolution: reads `name` search param, suspends on `useSuspenseTmdbPersonSearchQuery`, `pickPersonMatch` → `<Redirect>` to `/person/{id}`; on miss renders a "Person not found" view (same style as the details Not-found state).

## 6. Details screen changes — `src/app/details/[id].tsx`

- `PersonCard` becomes pressable (`PresstableScale` per the pressto rule): `tmdbId != null` → `routes.person(tmdbId)`, else → `routes.personLookup(name)`. Not pressable when `tmdbToken()` is empty.
- **Credit → details resolution:** add `findInTmdbCreditsCache(queryClient, id)` alongside `findInSearchCache` — scans cached `tmdbQueryKeys` person queries' rows so items opened from a filmography resolve without plan-0007 provider-fetch.
- **Trakt identity backfill:** credit items carry a tmdb id but no trakt id, so seasons/people/studios wouldn't render. Add `useTraktIdentityQuery(item)` in `state/queries/mapping.ts` — enabled when `externalIds.trakt == null && externalIds.tmdb != null`, runs the existing `lookupByExternalId` (`trakt/reads.ts`) under the existing `mappingQueryKeys.traktLookup('tmdb', id, kind)` key (kind from `item.type`), merged via the existing `mergeCatalogueMetadata`. (`useMovieCatalogueQuery` stays as-is for the Letterboxd title+year path.)

## 7. Galeria image zoom

- `bun add @nandorojo/galeria`. **Native module → rebuild required** (`bun ios.clean` / `bun android.clean`); no Expo Go. New Architecture requirement is met (Expo 57 / RN 0.86). Galeria needs **iOS deployment target ≥ 16.4** — if prebuild rejects it, add `expo-build-properties` to `app.json` plugins with `ios.deploymentTarget: "16.4"` (config change → also rebuild).
- Wrap once, per convention: **`src/components/zoomable-image.tsx`** — composes `<Galeria urls={[uri]}><Galeria.Image>` around the app's existing `components/image` (expo-image is supported by galeria); renders a plain `Image` when the uri is empty. Screens never import galeria directly (add to `no-restricted-imports` in `.oxlintrc.json`, same pattern as the List/expo-image rules).
- Use it for: the details-screen poster (`artwork.coverImage`) and the person-screen headshot. Galeria's web support is single-image only — exactly our usage, so web works too.

## 8. Verification

1. `bun test` — new tmdb normalize + `pickPersonMatch` tests pass alongside the suite.
2. `bun lint` — includes the new galeria import rule.
3. CORS probe: `curl -si -H 'Origin: http://localhost:8081' 'https://api.themoviedb.org/3/person/500?append_to_response=combined_credits' -H 'Authorization: Bearer …'` (+ OPTIONS preflight) → write `docs/solutions/web-cors-tmdb.md`.
4. Manual, with `EXPO_PUBLIC_TMDB_TOKEN` in `.env` (web first — no rebuild needed for everything except galeria):
   - Movie/TV details → tap a cast member (has tmdbId) → person page: bio + Acting/Directing rows, newest first.
   - Anime details (AniList credits) → tap a voice actor → `/person/lookup` resolves by name → person page.
   - Tap a filmography card → details page resolves (via tmdb-credits cache) and backfills Trakt identity (seasons/cast/studios render).
   - Poster tap on details + headshot tap on person → galeria zoom (web single-image; native after `bun ios.clean`).

## Out of scope / follow-ups

- BYO TMDB key settings UI (env-only for now).
- Logging directly from person-page cards (cards navigate; logging happens on details).
