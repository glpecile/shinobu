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
 * (`features/up-next/compute.ts`) — which is only possible because
 * `normalizeCurrentAnimeEntry` now carries `status` through (KTD-3). Sorted
 * most-recently-updated first to match the Trakt watched feed's ordering.
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
    } | null;
  } | null;
}

/**
 * The viewer's current recorded state for one media — what the log
 * reconciliation (plan 0011 decision 7) compares against, what the write
 * adapter reads to compute rewatch counters, and what the watchlist add
 * (`planOnAniList`) refuses to overwrite on (plan 0031 KTD-2).
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
        mediaListEntry { id status progress repeat }
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
              },
      };
    }),
  );
}
