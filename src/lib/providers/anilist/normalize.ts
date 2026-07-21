import type {
  NormalizedDiaryEntry,
  NormalizedMediaItem,
} from '@/types/media';

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

// ---- Diary activity (plan 0016) ----

/**
 * One `ListActivity` from `Page.activities` — AniList's closest diary analogue.
 * `status` is a phrase ("watched episode", "read chapter", "completed", "plans
 * to watch", …); `progress` a number or hyphen range ("3 - 5"). AniList
 * activity reflects *list updates* (including manual progress edits), and
 * per-account/per-entry visibility settings can hide entries entirely — an
 * empty slice is never proof of no history (plan 0016 U2 / Open Questions).
 */
export interface AniListListActivity {
  id: number;
  status?: string | null;
  progress?: string | null;
  /** Epoch seconds. */
  createdAt?: number | null;
  media?: AniListMedia | null;
}

// Only watch/read-shaped updates are diary logs: a "watched episode",
// "rewatched episode", "read chapter", or "completed" activity. Plan/pause/drop
// status changes are list bookkeeping, not a watch — they drop out.
const DIARY_STATUS = /^(watched|rewatched|read|completed)/i;

/**
 * Parses an AniList activity `progress` string into the episode/chapter number
 * set (plan 0016 KTD2). "3 - 5" → [3, 4, 5]; "12" → [12]; empty/absent → [].
 */
export function parseActivityProgress(
  progress: string | null | undefined,
): number[] {
  if (progress == null) return [];
  const cleaned = progress.trim();
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(cleaned);
  if (range != null) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (start <= end) {
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }
  }
  const single = /^(\d+)$/.exec(cleaned);
  return single != null ? [Number(single[1])] : [];
}

/**
 * A media-list activity → one diary entry, or `null` for a non-diary status
 * (plans/paused/dropped) or an activity with no media. `createdAt` (epoch
 * seconds) becomes an ISO instant so day grouping stays timezone-correct
 * (plan 0016 R4). A completed *film* carries no episode detail.
 */
export function normalizeListActivity(
  raw: AniListListActivity,
): NormalizedDiaryEntry | null {
  if (raw.media == null) return null;
  if (raw.status == null || !DIARY_STATUS.test(raw.status.trim())) return null;

  const watchedAt =
    raw.createdAt != null
      ? new Date(raw.createdAt * 1000).toISOString()
      : new Date(0).toISOString();
  const item = normalizeAniListMedia(raw.media, watchedAt);
  const episodes = item.isFilm === true ? [] : parseActivityProgress(raw.progress);

  return {
    id: `anilist-${raw.id}`,
    provider: 'anilist',
    watchedAt,
    item,
    ...(episodes.length > 0 ? { episodes } : {}),
  };
}
