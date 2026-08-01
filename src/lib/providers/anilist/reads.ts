import { Clock, Effect } from 'effect';

import type {
  NormalizedDiaryEntry,
  NormalizedMediaItem,
} from '@/types/media';
import type { ProviderError } from '@/lib/providers/errors';
import type { AniListDeps } from './deps';
import { anilistAuthedRequest, anilistRequest } from './http';
import type { AnimeSeasonWindow } from './season';
import {
  normalizeAniListMedia,
  normalizeCurrentAnimeEntry,
  normalizeListActivity,
  type AniListCurrentEntry,
  type AniListListActivity,
  type AniListListEntry,
  type AniListMedia,
} from './normalize';

/** Media fields every read asks for — one fragment so normalization never misses a field. */
const MEDIA_FIELDS = `
  id
  idMal
  type
  format
  title { english romaji native }
  description(asHtml: false)
  coverImage { extraLarge large }
  bannerImage
  seasonYear
  startDate { year }
  duration
  genres
  averageScore
  episodes
  chapters
`;

/** The authenticated account: its id, and the handle to show for it. */
export interface AniListViewer {
  id: number;
  name: string;
}

/**
 * The authenticated account. MediaListCollection requires the id; the query
 * layer caches this under its own key (it never changes for a session), so it
 * stays a separate tiny request instead of a per-read prefix.
 *
 * `name` rides along for free on the same request — AniList's OAuth session
 * carries no username of its own, so the Manage Trackers card has no other way
 * to say *which* account is connected.
 */
export function getViewer(
  deps: AniListDeps,
): Effect.Effect<AniListViewer, ProviderError> {
  return anilistAuthedRequest<{ Viewer: AniListViewer }>(
    deps,
    `query { Viewer { id name } }`,
  ).pipe(Effect.map((data) => data.Viewer));
}

interface MediaListCollectionResponse {
  MediaListCollection: {
    lists: Array<{ entries: Array<AniListListEntry | null> | null } | null> | null;
  } | null;
}

/**
 * The viewer's watching **and** planned anime (`MediaListCollection(status_in:
 * [CURRENT, PLANNING])` — plan.md 1.2, widened by plan 0030 R12), flattened
 * across AniList's custom lists and normalized. Feeds the "Your Anime" row and,
 * through the same single request, Up Next's anime half (plan 0019 U2):
 * `nextAiringEpisode` rides along on each media instead of costing one
 * airing-schedule request per series, which the 30 req/min budget cannot afford
 * (docs/solutions/anilist-rate-limit-retry-storm.md). `status_in` is why the
 * widening stayed **one** request rather than a second PLANNING read — the same
 * budget forbids doubling this call.
 *
 * The two statuses are not interchangeable and are *not* separated here: every
 * consumer takes its own slice of one cached list — "Your Anime" filters to
 * CURRENT (`state/queries/anilist.ts`), Up Next confines PLANNING to Calendar
 * (`features/up-next/compute.ts`), and the cross-provider watchlist takes
 * PLANNING alone (`fetchPlannedAnime`, plan 0031 U12) — which is only possible
 * because `normalizeCurrentAnimeEntry` carries `status` through (KTD-3). Adding
 * that third consumer cost **zero** extra requests for exactly this reason;
 * see `docs/solutions/anilist-shared-list-query-status-gate.md` for the gate the
 * slices have to keep. Sorted most-recently-updated first to match the Trakt
 * watched feed's ordering.
 *
 * The entry `id` rides along as `entryId` for the removal path (plan 0031 U12).
 * It is a hint, never a guard — see `AniListCurrentEntry.entryId` (R36).
 */
export function getCurrentAnime(
  deps: AniListDeps,
  params: { viewerId: number },
): Effect.Effect<AniListCurrentEntry[], ProviderError> {
  return Effect.gen(function* () {
    const data = yield* anilistAuthedRequest<MediaListCollectionResponse>(
      deps,
      `query ($userId: Int) {
        MediaListCollection(userId: $userId, type: ANIME, status_in: [CURRENT, PLANNING]) {
          lists {
            entries {
              id
              status
              progress
              repeat
              updatedAt
              media {
                ${MEDIA_FIELDS}
                nextAiringEpisode { episode airingAt }
              }
            }
          }
        }
      }`,
      { variables: { userId: params.viewerId } },
    );
    const now = yield* Clock.currentTimeMillis;
    const nowIso = new Date(now).toISOString();

    const entries = (data.MediaListCollection?.lists ?? [])
      .flatMap((list) => list?.entries ?? [])
      .filter((entry): entry is AniListListEntry => entry != null);

    // A media can sit on several custom lists — dedupe by media id.
    const seen = new Set<number>();
    const listed: AniListCurrentEntry[] = [];
    for (const entry of entries) {
      if (seen.has(entry.media.id)) continue;
      seen.add(entry.media.id);
      listed.push(normalizeCurrentAnimeEntry(entry, nowIso));
    }
    return listed.sort((a, b) =>
      b.item.lastUpdated.localeCompare(a.item.lastUpdated),
    );
  });
}

interface ListActivityResponse {
  Page: {
    activities: Array<AniListListActivity | null> | null;
  } | null;
}

/**
 * One page of the viewer's media-list activity — AniList's diary equivalent
 * (plan 0016 U2). `type: MEDIA_LIST` + `sort: ID_DESC` gives newest-first log
 * updates; non-watch/read statuses (plan/pause/drop) drop out in normalization.
 * Reuses the cached `viewerId`. Page size stays inside the 30 req/min budget
 * (docs/solutions/anilist-rate-limit-retry-storm.md) — the caller sets a
 * generous staleTime and `maxPages` (plan 0016 KTD9).
 */
export function getListActivity(
  deps: AniListDeps,
  params: { viewerId: number; page: number; perPage?: number },
): Effect.Effect<NormalizedDiaryEntry[], ProviderError> {
  const perPage = params.perPage ?? 50;
  return anilistAuthedRequest<ListActivityResponse>(
    deps,
    `query ($userId: Int, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        activities(userId: $userId, type: MEDIA_LIST, sort: ID_DESC) {
          ... on ListActivity {
            id
            status
            progress
            createdAt
            media { ${MEDIA_FIELDS} }
          }
        }
      }
    }`,
    {
      variables: {
        userId: params.viewerId,
        page: params.page,
        perPage,
      },
    },
  ).pipe(
    Effect.map((data) =>
      (data.Page?.activities ?? [])
        .filter((activity): activity is AniListListActivity => activity != null)
        .map((activity) => normalizeListActivity(activity))
        .filter((entry): entry is NormalizedDiaryEntry => entry != null),
    ),
  );
}

interface TrendingResponse {
  Page: { media: Array<AniListMedia | null> | null } | null;
}

/**
 * Public trending anime — no session required, so the feed shows anime even
 * before AniList is connected (plan.md 2.1, same contract as Trakt trending).
 */
export function getTrendingAnime(
  deps: AniListDeps,
  options: { limit?: number } = {},
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  const limit = options.limit ?? 30;
  return Effect.gen(function* () {
    const data = yield* anilistRequest<TrendingResponse>(
      deps,
      `query ($perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          media(type: ANIME, sort: TRENDING_DESC) { ${MEDIA_FIELDS} }
        }
      }`,
      { variables: { perPage: limit } },
    );
    const now = yield* Clock.currentTimeMillis;
    const nowIso = new Date(now).toISOString();
    return (data.Page?.media ?? [])
      .filter((media): media is AniListMedia => media != null)
      .map((media) => normalizeAniListMedia(media, nowIso));
  });
}

/**
 * Public most-popular anime of one cour ("Summer 2026") — the home feed's
 * anime row. Same no-session contract as trending; POPULARITY_DESC because
 * TRENDING_DESC within a season over-weights week-to-week noise.
 */
export function getSeasonalAnime(
  deps: AniListDeps,
  params: { season: AnimeSeasonWindow['season']; year: number; limit?: number },
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  const limit = params.limit ?? 30;
  return Effect.gen(function* () {
    const data = yield* anilistRequest<TrendingResponse>(
      deps,
      `query ($perPage: Int, $season: MediaSeason, $seasonYear: Int) {
        Page(page: 1, perPage: $perPage) {
          media(type: ANIME, season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC) { ${MEDIA_FIELDS} }
        }
      }`,
      {
        variables: {
          perPage: limit,
          season: params.season,
          seasonYear: params.year,
        },
      },
    );
    const now = yield* Clock.currentTimeMillis;
    const nowIso = new Date(now).toISOString();
    return (data.Page?.media ?? [])
      .filter((media): media is AniListMedia => media != null)
      .map((media) => normalizeAniListMedia(media, nowIso));
  });
}

/** A staff or studio search hit, reduced to what a deep link needs. */
export interface AniListNamedEntity {
  id: number;
  name: string;
}

interface StaffSearchResponse {
  Page: {
    staff: Array<{
      id: number | null;
      name: { full?: string | null; native?: string | null } | null;
    } | null> | null;
  } | null;
}

interface StudioSearchResponse {
  Page: {
    studios: Array<{ id: number | null; name?: string | null } | null> | null;
  } | null;
}

/** Five hits: enough for `pickPersonMatch` to find an exact name, no more. */
const NAME_SEARCH_PER_PAGE = 5;

/**
 * Public staff search by name (plan 0035 R12) — the resolution step behind
 * "Open in AniList" for a person. Unauthenticated, like trending: AniList's
 * public schema answers staff queries with no token, and a person's staff id
 * has nothing to do with who is signed in.
 *
 * Returns hits, never a choice: the caller runs `pickPersonMatch` over them and
 * shows no link at all when nothing matches confidently (R13). `name.full` is
 * the romanized name TMDB's spelling can meet; `name.native` backs it up for a
 * staff member AniList only romanizes one way.
 */
export function searchAniListStaff(
  deps: AniListDeps,
  params: { name: string },
): Effect.Effect<AniListNamedEntity[], ProviderError> {
  return anilistRequest<StaffSearchResponse>(
    deps,
    `query ($search: String, $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        staff(search: $search) { id name { full native } }
      }
    }`,
    { variables: { search: params.name, perPage: NAME_SEARCH_PER_PAGE } },
  ).pipe(
    Effect.map((data) =>
      (data.Page?.staff ?? []).flatMap((staff) => {
        const id = staff?.id;
        const name = staff?.name?.full ?? staff?.name?.native ?? '';
        return id == null || name === '' ? [] : [{ id, name }];
      }),
    ),
  );
}

/** The studio half of `searchAniListStaff` — same contract, flatter payload. */
export function searchAniListStudio(
  deps: AniListDeps,
  params: { name: string },
): Effect.Effect<AniListNamedEntity[], ProviderError> {
  return anilistRequest<StudioSearchResponse>(
    deps,
    `query ($search: String, $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        studios(search: $search) { id name }
      }
    }`,
    { variables: { search: params.name, perPage: NAME_SEARCH_PER_PAGE } },
  ).pipe(
    Effect.map((data) =>
      (data.Page?.studios ?? []).flatMap((studio) => {
        const id = studio?.id;
        const name = studio?.name ?? '';
        return id == null || name === '' ? [] : [{ id, name }];
      }),
    ),
  );
}

/**
 * Public text search across anime + manga — no type filter, so one request
 * covers everything AniList can log (registry: ANIME + MANGA). Same
 * no-session contract as trending; SEARCH_MATCH keeps exact-title hits above
 * popularity noise.
 */
export function searchMedia(
  deps: AniListDeps,
  params: { query: string; limit?: number },
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  const limit = params.limit ?? 20;
  return Effect.gen(function* () {
    const data = yield* anilistRequest<TrendingResponse>(
      deps,
      `query ($search: String, $perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          media(search: $search, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} }
        }
      }`,
      { variables: { search: params.query, perPage: limit } },
    );
    const now = yield* Clock.currentTimeMillis;
    const nowIso = new Date(now).toISOString();
    return (data.Page?.media ?? [])
      .filter((media): media is AniListMedia => media != null)
      .map((media) => normalizeAniListMedia(media, nowIso));
  });
}

/**
 * Anime *films* by title — the discovery fallback for an anime movie that
 * arrived from TMDB/Trakt with no AniList id (plan 0024 KTD3). ani.zip's
 * `themoviedb_id` index is TV-oriented and misses many films (ChaO, 2025), so
 * without this the log fan-out silently drops AniList for exactly the items an
 * AniList user most wants logged. Narrowed to `type: ANIME, format: MOVIE` so
 * the caller's year gate only ever sees films; `SEARCH_MATCH` ranks by title
 * relevance, not popularity.
 */
export function searchAnimeFilms(
  deps: AniListDeps,
  params: { query: string; limit?: number },
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  const limit = params.limit ?? 10;
  return Effect.gen(function* () {
    const data = yield* anilistRequest<TrendingResponse>(
      deps,
      `query ($search: String, $perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          media(search: $search, type: ANIME, format: MOVIE, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} }
        }
      }`,
      { variables: { search: params.query, perPage: limit } },
    );
    const now = yield* Clock.currentTimeMillis;
    const nowIso = new Date(now).toISOString();
    return (data.Page?.media ?? [])
      .filter((media): media is AniListMedia => media != null)
      .map((media) => normalizeAniListMedia(media, nowIso));
  });
}

export interface AniListEntryState {
  /**
   * null when the viewer has no list entry for this media yet.
   *
   * `id` is the **MediaList entry** id, not the media id — the only handle
   * `DeleteMediaListEntry` accepts (plan 0031 R34/R36), so an un-watchlist has
   * no other way to name what it removes. Nullable because the field is only
   * as trustworthy as the payload: an entry that decodes without one is not a
   * deletion target, and the caller must say so rather than delete an
   * arbitrary id.
   */
  entry: {
    id: number | null;
    status: string | null;
    progress: number;
    repeat: number;
    /**
     * The four fields below exist for one caller: `deleteAniListEntry`
     * (plan 0031 R36.2). `DeleteMediaListEntry` destroys the *whole* entry, so
     * "bare PLANNING" has to mean bare in every sense — a `PLANNING` entry with
     * `progress: 0` can still carry a score, notes, a start date or custom-list
     * membership, which is exactly the entry content KTD-2 refuses to *write
     * over* on the add side. Deleting it would be the same loss by another
     * route, so the removal guard needs to see them.
     */
    /** 0 when unscored — AniList reports the viewer's own score format. */
    score: number;
    notes: string | null;
    /** Null when AniList has no start date; components are individually fuzzy. */
    startedAt: {
      year: number | null;
      month: number | null;
      day: number | null;
    } | null;
    /** Names of the custom lists this entry sits on; empty when it sits on none. */
    customLists: string[];
  } | null;
  /** Total episodes when AniList knows it (null for ongoing shows). */
  episodes: number | null;
}

interface MediaEntryResponse {
  Media: {
    episodes: number | null;
    mediaListEntry: {
      id: number | null;
      status: string | null;
      progress: number | null;
      repeat: number | null;
      score: number | null;
      notes: string | null;
      startedAt: {
        year: number | null;
        month: number | null;
        day: number | null;
      } | null;
      /**
       * `customLists` is a `Json` field: an object keyed by list name whose
       * values say whether the entry is on that list (`{"Rewatching": false}`),
       * or an array of names when asked for `asArray`. Both shapes are handled
       * because the field's contract is JSON, not a typed list.
       */
      customLists: unknown;
    } | null;
  } | null;
}

/**
 * The custom lists an entry actually sits on, from AniList's untyped `Json`
 * payload. Membership is the boolean value, not key presence — AniList returns
 * *every* list the viewer defined, most of them `false`, so keying on presence
 * would refuse every removal for any viewer who has ever made a custom list
 * (plan 0031 R36.2).
 */
function readCustomLists(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((name): name is string => typeof name === 'string');
  }
  if (raw != null && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, member]) => member === true)
      .map(([name]) => name);
  }
  return [];
}

/**
 * The viewer's current recorded state for one media — what the log
 * reconciliation (plan 0011 decision 7) compares against, what the write
 * adapter reads to compute rewatch counters, what the watchlist add
 * (`planOnAniList`) refuses to overwrite on (plan 0031 KTD-2), and what the
 * removal (`deleteAniListEntry`) refuses to destroy on (R36).
 */
export function getEntryState(
  deps: AniListDeps,
  params: { mediaId: number },
): Effect.Effect<AniListEntryState, ProviderError> {
  return anilistAuthedRequest<MediaEntryResponse>(
    deps,
    `query ($mediaId: Int) {
      Media(id: $mediaId) {
        episodes
        mediaListEntry { id status progress repeat score notes startedAt { year month day } customLists }
      }
    }`,
    { variables: { mediaId: params.mediaId } },
  ).pipe(
    Effect.map((data) => {
      const raw = data.Media?.mediaListEntry ?? null;
      return {
        episodes: data.Media?.episodes ?? null,
        entry:
          raw == null
            ? null
            : {
                id: raw.id ?? null,
                status: raw.status,
                progress: raw.progress ?? 0,
                repeat: raw.repeat ?? 0,
                score: raw.score ?? 0,
                notes: raw.notes ?? null,
                startedAt: raw.startedAt ?? null,
                customLists: readCustomLists(raw.customLists),
              },
      };
    }),
  );
}
