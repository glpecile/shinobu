import { Clock, Effect } from 'effect';

import type { NormalizedMediaItem } from '@/types/media';
import type { ProviderError } from '@/lib/providers/errors';
import type { AniListDeps } from './deps';
import { anilistAuthedRequest, anilistRequest } from './http';
import type { AnimeSeasonWindow } from './season';
import {
  normalizeAniListListEntry,
  normalizeAniListMedia,
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

/**
 * The authenticated account's AniList user id. MediaListCollection requires
 * it; the query layer caches it under its own key (it never changes for a
 * session), so this stays a separate tiny request instead of a per-read
 * prefix.
 */
export function getViewerId(deps: AniListDeps): Effect.Effect<number, ProviderError> {
  return anilistAuthedRequest<{ Viewer: { id: number } }>(
    deps,
    `query { Viewer { id } }`,
  ).pipe(Effect.map((data) => data.Viewer.id));
}

interface MediaListCollectionResponse {
  MediaListCollection: {
    lists: Array<{ entries: Array<AniListListEntry | null> | null } | null> | null;
  } | null;
}

/**
 * The viewer's currently-watching anime (`MediaListCollection(status:
 * CURRENT)` — plan.md 1.2), flattened across AniList's custom lists and
 * normalized. Feeds the "Your Anime" row. Sorted most-recently-updated first
 * to match the Trakt watched feed's ordering.
 */
export function getCurrentAnime(
  deps: AniListDeps,
  params: { viewerId: number },
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  return Effect.gen(function* () {
    const data = yield* anilistAuthedRequest<MediaListCollectionResponse>(
      deps,
      `query ($userId: Int) {
        MediaListCollection(userId: $userId, type: ANIME, status: CURRENT) {
          lists {
            entries {
              status
              progress
              repeat
              updatedAt
              media { ${MEDIA_FIELDS} }
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
    const items: NormalizedMediaItem[] = [];
    for (const entry of entries) {
      if (seen.has(entry.media.id)) continue;
      seen.add(entry.media.id);
      items.push(normalizeAniListListEntry(entry, nowIso));
    }
    return items.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
  });
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

export interface AniListEntryState {
  /** null when the viewer has no list entry for this media yet. */
  entry: { status: string | null; progress: number; repeat: number } | null;
  /** Total episodes when AniList knows it (null for ongoing shows). */
  episodes: number | null;
}

interface MediaEntryResponse {
  Media: {
    episodes: number | null;
    mediaListEntry: {
      status: string | null;
      progress: number | null;
      repeat: number | null;
    } | null;
  } | null;
}

/**
 * The viewer's current recorded state for one media — what the log
 * reconciliation (plan 0011 decision 7) compares against, and what the write
 * adapter reads to compute rewatch counters.
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
        mediaListEntry { status progress repeat }
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
                status: raw.status,
                progress: raw.progress ?? 0,
                repeat: raw.repeat ?? 0,
              },
      };
    }),
  );
}
