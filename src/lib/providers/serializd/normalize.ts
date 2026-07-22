import type { NormalizedDiaryEntry } from '@/types/media';

/**
 * One raw diary review off `GET /user/{username}/diary` (Appendix). Fields are
 * optional/tolerant — the API is unofficial and shapes drift. `showId` is the
 * TMDB id (Serializd's join key, KTD2); `backdate` is the user-set watch instant
 * and `dateAdded` is when the log was created (the field the server pages by,
 * KTD8). `episodeNumber` is absent on season-level entries.
 */
export interface SerializdDiaryReview {
  /** Some clients name the review id `reviewId`, some `id` (Appendix note). */
  reviewId?: number | string;
  id?: number | string;
  showId: number;
  seasonId?: number;
  seasonName?: string;
  episodeNumber?: number;
  /** ISO instant the log was created — the diary's page-order key (KTD8). */
  dateAdded: string;
  /** ISO instant the user watched (may be backdated) — the display instant. */
  backdate?: string;
  rating?: number;
  reviewText?: string;
  isRewatched?: boolean;
  isLogged?: boolean;
  showName?: string;
  /** TMDB poster path (`/abc.jpg`) when present; metadata merges TMDB-first anyway. */
  posterPath?: string;
}

/** TMDB poster path → a CDN url; '' when absent (details screen resolves it). */
function posterUrl(path?: string): string {
  if (path == null || path === '') return '';
  return `https://image.tmdb.org/t/p/w342${path}`;
}

/** `"Season 2"` → `2`, `"Specials"` → `0`; undefined when no number is present. */
export function parseSeasonNumber(seasonName?: string): number | undefined {
  if (seasonName == null) return undefined;
  if (/special/i.test(seasonName)) return 0;
  const match = /\d+/.exec(seasonName);
  return match == null ? undefined : Number(match[0]);
}

/**
 * A raw diary review → a `NormalizedDiaryEntry`. The id is the response's review
 * id when present, else a synthesized `serializd:{showId}:{seasonId}:{episode}:
 * {dateAdded}` (Appendix / U2) — stable and unique enough that two same-day logs
 * don't collide. `watchedAt` is `dateAdded` (KTD8: the diary isn't guaranteed
 * sorted by `backdate`, so the shared watermark/grouping — which key on
 * `watchedAt` — must key on the server's page order). Season-level entries carry
 * no `episodes`.
 */
export function normalizeDiaryReview(
  raw: SerializdDiaryReview,
  fetchedAt: string,
): NormalizedDiaryEntry {
  const reviewId = raw.reviewId ?? raw.id;
  const id =
    reviewId != null
      ? `serializd-${reviewId}`
      : `serializd:${raw.showId}:${raw.seasonId ?? ''}:${raw.episodeNumber ?? ''}:${raw.dateAdded}`;
  const season = parseSeasonNumber(raw.seasonName);

  return {
    id,
    provider: 'serializd',
    // KTD8: order/group by the server's page field, not the (possibly
    // backdated, non-monotone) watch instant.
    watchedAt: raw.dateAdded,
    ...(raw.episodeNumber != null ? { episodes: [raw.episodeNumber] } : {}),
    ...(season != null ? { season } : {}),
    item: {
      id: `serializd-${raw.showId}`,
      title: raw.showName ?? '',
      coverImage: posterUrl(raw.posterPath),
      type: 'TV',
      currentProgress: 0,
      progressUnit: 'episode',
      lastUpdated: fetchedAt,
      externalIds: { tmdb: raw.showId },
    },
  };
}
