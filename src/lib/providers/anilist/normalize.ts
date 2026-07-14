import type { NormalizedMediaItem } from '@/types/media';

/** Raw AniList payload shapes — these never escape lib/providers (AGENTS.md Data Contract). */

export interface AniListMediaTitle {
  english?: string | null;
  romaji?: string | null;
  native?: string | null;
}

export interface AniListMedia {
  id: number;
  type?: 'ANIME' | 'MANGA' | null;
  /** TV, TV_SHORT, MOVIE, SPECIAL, OVA, ONA, MUSIC, MANGA, NOVEL, ONE_SHOT. */
  format?: string | null;
  title?: AniListMediaTitle | null;
  /** HTML-ish (<br>, <i>…) even with asHtml: false. */
  description?: string | null;
  coverImage?: { extraLarge?: string | null; large?: string | null } | null;
  bannerImage?: string | null;
  seasonYear?: number | null;
  startDate?: { year?: number | null } | null;
  /** Minutes per episode. */
  duration?: number | null;
  genres?: Array<string | null> | null;
  /** Community mean score, 0–100. */
  averageScore?: number | null;
  episodes?: number | null;
  chapters?: number | null;
  idMal?: number | null;
}

/** One MediaListCollection entry (the viewer's list row for a media). */
export interface AniListListEntry {
  status?: string | null;
  progress?: number | null;
  /** Completed rewatch count. */
  repeat?: number | null;
  /** Epoch seconds. */
  updatedAt?: number | null;
  media: AniListMedia;
}

/**
 * Both-ways title matching (AGENTS.md/todos/002): prefer the English title,
 * fall back to Romanized, then native — never an empty card for a title
 * that only exists in one variant.
 */
export function anilistTitle(media: AniListMedia): string {
  const title = media.title;
  return title?.english ?? title?.romaji ?? title?.native ?? '';
}

/** AniList descriptions carry HTML line breaks/markup even as "plain text". */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * AniList Media → NormalizedMediaItem. `nowIso` keeps this pure — catalogue
 * entries (trending) carry no personal timestamp, so the read effect supplies
 * the instant from Effect's Clock (same contract as trakt/normalize.ts).
 */
export function normalizeAniListMedia(
  media: AniListMedia,
  nowIso: string,
): NormalizedMediaItem {
  const type = media.type === 'MANGA' ? 'MANGA' : 'ANIME';
  const total = type === 'MANGA' ? media.chapters : media.episodes;
  const year = media.seasonYear ?? media.startDate?.year;
  const genres = media.genres?.filter((genre): genre is string => genre != null);

  return {
    id: `anilist-${media.id}`,
    title: anilistTitle(media),
    coverImage: media.coverImage?.extraLarge ?? media.coverImage?.large ?? '',
    ...(media.bannerImage != null ? { backdropImage: media.bannerImage } : {}),
    ...(media.description != null ? { overview: stripHtml(media.description) } : {}),
    ...(year != null ? { year } : {}),
    ...(media.duration != null ? { runtime: media.duration } : {}),
    ...(genres != null && genres.length > 0 ? { genres } : {}),
    ...(media.averageScore != null ? { rating: media.averageScore / 10 } : {}),
    type,
    // AniList's ANIME covers movie-format entries; MOVIE format is what makes
    // an item fan out to Trakt/Letterboxd as a film (plan.md 1.3).
    ...(media.format === 'MOVIE' ? { isFilm: true } : {}),
    currentProgress: 0,
    progressUnit: type === 'MANGA' ? 'chapter' : 'episode',
    ...(total != null ? { totalEpisodes: total } : {}),
    lastUpdated: nowIso,
    externalIds: { anilist: media.id },
  };
}

/**
 * A viewer's list entry → NormalizedMediaItem with real progress and the
 * entry's own update instant (epoch seconds → ISO).
 */
export function normalizeAniListListEntry(
  entry: AniListListEntry,
  nowIso: string,
): NormalizedMediaItem {
  const base = normalizeAniListMedia(entry.media, nowIso);
  return {
    ...base,
    currentProgress: entry.progress ?? 0,
    ...(entry.updatedAt != null
      ? { lastUpdated: new Date(entry.updatedAt * 1000).toISOString() }
      : {}),
  };
}
