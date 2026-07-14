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
