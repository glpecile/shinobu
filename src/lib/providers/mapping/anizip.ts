import type { HttpFetch } from '@/lib/http/types';

export const ANIZIP_MAPPINGS_URL = 'https://api.ani.zip/mappings';

/**
 * Identity bridge for one anime across provider id spaces — the `mappings`
 * block of an ani.zip document (the API face of the community anime-lists
 * dataset, plan 0011 decision 5; CORS-verified in
 * docs/solutions/web-cors-anizip.md).
 */
export interface AniZipIds {
  anilist?: number;
  tvdb?: number;
  tmdb?: number;
  imdb?: string;
  /** "TV" | "MOVIE" | … as anime-lists classifies it. */
  type?: string;
}

export type AniZipLookup =
  | { anilistId: number }
  | { tvdbId: number }
  | { tmdbId: number };

/**
 * One canonical `{season, number}` pair — the numbering Trakt and Serializd
 * (via TMDB) speak, as opposed to an AniList entry's own 1..n episodes.
 * ani.zip's `seasonNumber` is TVDB-derived (plan 0027 KTD6).
 */
export interface AniZipCanonicalEpisode {
  season: number;
  number: number;
}

/** Entry-relative episode number → its canonical `{season, number}`. */
export type AniZipEpisodeMap = ReadonlyMap<number, AniZipCanonicalEpisode>;

interface AniZipResponse {
  mappings?: {
    anilist_id?: number | null;
    thetvdb_id?: number | null;
    /** ani.zip sends TMDB ids as strings. */
    themoviedb_id?: string | number | null;
    imdb_id?: string | null;
    type?: string | null;
  } | null;
}

/**
 * The per-episode half of the same document. Deliberately a separate interface
 * from `AniZipResponse`: the ids decode stays byte-for-byte what it was, so the
 * feed path never starts retaining this block (plan 0027 KTD1).
 */
interface AniZipEpisodesResponse {
  episodes?: Record<
    string,
    { seasonNumber?: number | null; episodeNumber?: number | null } | null
  > | null;
}

function queryFor(lookup: AniZipLookup): string {
  if ('anilistId' in lookup) return `anilist_id=${lookup.anilistId}`;
  if ('tvdbId' in lookup) return `thetvdb_id=${lookup.tvdbId}`;
  return `themoviedb_id=${lookup.tmdbId}`;
}

/**
 * One mapping lookup, deliberately *not* an Effect and *not* failable: a
 * mapping miss (unknown id, non-anime, network hiccup) degrades to `null`,
 * which downstream reads as "this item only exists on its origin provider" —
 * the fan-out then simply doesn't widen (plan 0011 decision 5). Responses can
 * be ~1 MB (the per-episode table); only `mappings` is decoded. Callers cache
 * results (mappings don't churn) — see `features/log-media/enrich.ts`.
 */
export async function fetchAniZipIds(
  fetch: HttpFetch,
  lookup: AniZipLookup,
): Promise<AniZipIds | null> {
  try {
    const response = await fetch(`${ANIZIP_MAPPINGS_URL}?${queryFor(lookup)}`);
    if (!response.ok) return null;
    const body = (await response.json()) as AniZipResponse;
    const mappings = body.mappings;
    if (mappings == null) return null;

    const tmdb = Number(mappings.themoviedb_id);
    return {
      ...(mappings.anilist_id != null ? { anilist: mappings.anilist_id } : {}),
      ...(mappings.thetvdb_id != null ? { tvdb: mappings.thetvdb_id } : {}),
      ...(Number.isFinite(tmdb) && tmdb > 0 ? { tmdb } : {}),
      ...(mappings.imdb_id != null ? { imdb: mappings.imdb_id } : {}),
      ...(mappings.type != null ? { type: mappings.type } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * The *numbering* bridge, sibling to `fetchAniZipIds`'s identity bridge (plan
 * 0027 KTD1): AniList models every anime season as its own series entry with
 * episodes 1..n, while Trakt/Serializd/TMDB model one show with numbered
 * seasons. ani.zip's `episodes` block keys AniList-entry-relative numbers to
 * the canonical `{seasonNumber, episodeNumber}` pair, so a sequel entry's
 * episode 3 resolves to S02E03 instead of the phantom S01E03 the fan-out used
 * to write.
 *
 * Same non-failable contract as the ids fetch — `null` on any miss, never a
 * throw — and the same ~1 MB payload hazard
 * (docs/solutions/web-cors-anizip.md), which is why only `{season, number}`
 * survives the decode and only *write actions* ever call this (KTD4). Keys are
 * AniDB-entry-derived: `"S1"`-style specials keys and any entry without a
 * season/episode number are dropped rather than guessed at.
 */
export async function fetchAniZipEpisodeMap(
  fetch: HttpFetch,
  lookup: AniZipLookup,
): Promise<AniZipEpisodeMap | null> {
  try {
    const response = await fetch(`${ANIZIP_MAPPINGS_URL}?${queryFor(lookup)}`);
    if (!response.ok) return null;
    const body = (await response.json()) as AniZipEpisodesResponse;
    const episodes = body.episodes;
    if (episodes == null) return null;

    const map = new Map<number, AniZipCanonicalEpisode>();
    for (const [key, episode] of Object.entries(episodes)) {
      const entryNumber = Number(key);
      // "S1"/"S2" (specials) parse to NaN and drop out here.
      if (!Number.isInteger(entryNumber) || entryNumber < 1) continue;
      const season = episode?.seasonNumber;
      const number = episode?.episodeNumber;
      if (season == null || number == null) continue;
      if (!Number.isInteger(season) || !Number.isInteger(number)) continue;
      map.set(entryNumber, { season, number });
    }
    return map;
  } catch {
    return null;
  }
}
