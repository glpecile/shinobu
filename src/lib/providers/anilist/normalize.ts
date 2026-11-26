import { Provider } from '@/lib/providers/types';
import type { NormalizedDiaryEntry, NormalizedMediaItem } from '@/types/media';

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
  synonyms?: Array<string | null> | null;
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
  volumes?: number | null;
  staff?: {
    nodes?: Array<{
      name?: {
        full?: string | null;
        native?: string | null;
        alternative?: Array<string | null> | null;
      } | null;
    } | null> | null;
  } | null;
  idMal?: number | null;
  nextAiringEpisode?: AniListNextAiringEpisode | null;
  airingSchedule?: { nodes?: Array<AniListNextAiringEpisode | null> | null } | null;
  relations?: {
    edges?: Array<{
      relationType: string;
      node: { type?: string | null; mediaListEntry?: { status?: string | null } | null } | null;
    } | null> | null;
  } | null;
}

/** `airingAt` is Unix seconds. */
export interface AniListNextAiringEpisode {
  episode: number;
  airingAt: number;
}

export interface AniListListEntry {
  /** MediaList row id, not the media id. */
  id?: number | null;
  status?: string | null;
  progress?: number | null;
  /** Completed rewatch count. */
  repeat?: number | null;
  /** Epoch seconds. */
  updatedAt?: number | null;
  media: AniListMedia;
}

export function anilistTitle(media: AniListMedia): string {
  const title = media.title;
  return title?.english ?? title?.romaji ?? title?.native ?? '';
}

export function humanizeEnum(value: string): string {
  const lower = value.toLowerCase().replace(/_/g, ' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function stripHtmlMarkup(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stripHtml(html: string): string {
  return stripHtmlMarkup(html).replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1');
}

export function parseAniListItemId(id: string): number | null {
  const match = /^anilist-(\d+)$/.exec(id);
  return match == null ? null : Number(match[1]);
}

export function staffNames(nodes: NonNullable<AniListMedia['staff']>['nodes']): string[] {
  return (nodes ?? []).flatMap((node) =>
    [node?.name?.full, node?.name?.native, ...(node?.name?.alternative ?? [])].filter(
      (name): name is string => name != null && name !== '',
    ),
  );
}

export function normalizeAniListMedia(media: AniListMedia, nowIso: string): NormalizedMediaItem {
  const type = media.type === 'MANGA' ? 'MANGA' : 'ANIME';
  const total = type === 'MANGA' ? media.chapters : media.episodes;
  const year = media.seasonYear ?? media.startDate?.year;
  const genres = media.genres?.filter((genre): genre is string => genre != null);
  const aliases = media.synonyms?.filter(
    (alias): alias is string => alias != null && alias.trim() !== '',
  );
  const people = media.staff == null ? undefined : staffNames(media.staff.nodes);
  const titles = {
    ...(media.title?.romaji != null ? { romaji: media.title.romaji } : {}),
    ...(media.title?.english != null ? { english: media.title.english } : {}),
    ...(media.title?.native != null ? { native: media.title.native } : {}),
  };

  return {
    id: `anilist-${media.id}`,
    title: anilistTitle(media),
    ...(Object.keys(titles).length > 0 ? { titles } : {}),
    ...(aliases != null && aliases.length > 0 ? { titleAliases: aliases } : {}),
    coverImage: media.coverImage?.extraLarge ?? media.coverImage?.large ?? '',
    ...(media.bannerImage != null ? { backdropImage: media.bannerImage } : {}),
    ...(media.description != null ? { overview: stripHtml(media.description) } : {}),
    ...(year != null ? { year } : {}),
    ...(media.duration != null ? { runtime: media.duration } : {}),
    ...(genres != null && genres.length > 0 ? { genres } : {}),
    ...(media.averageScore != null
      ? { ratings: [{ source: Provider.AniList, value: media.averageScore, scale: '%' }] }
      : {}),
    type,
    ...(media.format === 'MOVIE' ? { isFilm: true } : {}),
    currentProgress: 0,
    progressUnit: type === 'MANGA' ? 'chapter' : 'episode',
    ...(total != null ? { totalEpisodes: total } : {}),
    lastUpdated: nowIso,
    ...(people != null
      ? {
          readingCredits: {
            people,
            ...(media.format != null ? { format: media.format } : {}),
            ...(media.volumes != null ? { volumes: media.volumes } : {}),
          },
        }
      : {}),
    externalIds: { anilist: media.id, ...(media.idMal != null ? { mal: media.idMal } : {}) },
  };
}

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

export interface AniListCurrentEntry {
  item: NormalizedMediaItem;
  status: 'CURRENT' | 'PLANNING';
  /**
   * `MediaList.id` (not the media id) that `DeleteMediaListEntry` deletes by.
   * Hint only: `DeleteMediaListEntry` drops progress, score, and notes, so
   * removal must guard on a fresh read rather than this cached field.
   */
  entryId?: number;
  /** Next scheduled episode (`airingAt` ISO instant); null for finished and unscheduled series alike. */
  nextAiring: { episode: number; airingAt: string } | null;
  /** Episode 1's air instant, retained when the next-airing pointer advances. */
  firstAired?: string;
  hasUnfinishedPrequel?: boolean;
  totalEpisodes: number | null;
}

export function normalizeCurrentAnimeEntry(
  entry: AniListListEntry,
  nowIso: string,
): AniListCurrentEntry {
  const airing = entry.media.nextAiringEpisode;
  const premiere = entry.media.airingSchedule?.nodes?.[0];
  return {
    item: normalizeAniListListEntry(entry, nowIso),
    status: entry.status === 'PLANNING' ? 'PLANNING' : 'CURRENT',
    ...(entry.id != null ? { entryId: entry.id } : {}),
    hasUnfinishedPrequel: (entry.media.relations?.edges ?? []).some(
      (edge) =>
        edge?.relationType === 'PREQUEL' &&
        edge.node?.type === 'ANIME' &&
        edge.node.mediaListEntry?.status !== 'COMPLETED',
    ),
    ...(premiere?.episode === 1
      ? { firstAired: new Date(premiere.airingAt * 1000).toISOString() }
      : {}),
    nextAiring:
      airing == null
        ? null
        : {
            episode: airing.episode,
            airingAt: new Date(airing.airingAt * 1000).toISOString(),
          },
    totalEpisodes: entry.media.episodes ?? null,
  };
}

export interface AniListMangaEntry {
  item: NormalizedMediaItem;
  status: 'CURRENT' | 'REPEATING' | 'PLANNING';
  /** The MediaList row's own id: a removal hint, never evidence (see `AniListCurrentEntry.entryId`). */
  entryId?: number;
}

export function normalizeCurrentMangaEntry(
  entry: AniListListEntry,
  nowIso: string,
): AniListMangaEntry {
  return {
    item: normalizeAniListListEntry(entry, nowIso),
    status: entry.status === 'PLANNING' || entry.status === 'REPEATING' ? entry.status : 'CURRENT',
    ...(entry.id != null ? { entryId: entry.id } : {}),
  };
}

/**
 * AniList `ListActivity`: `status` is a phrase ("watched episode", "plans to watch", …),
 * `progress` is a number or range ("3 - 5"), and privacy settings can hide entries so an
 * empty list does not prove there is no history.
 */
export interface AniListListActivity {
  id: number;
  status?: string | null;
  progress?: string | null;
  /** Epoch seconds. */
  createdAt?: number | null;
  media?: AniListMedia | null;
}

const DIARY_STATUS = /^(watched|rewatched|read|reread|completed)/i;

function parseActivityProgress(progress: string | null | undefined): number[] {
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

export function normalizeListActivity(raw: AniListListActivity): NormalizedDiaryEntry | null {
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
    provider: Provider.AniList,
    watchedAt,
    item,
    ...(episodes.length > 0 ? { episodes } : {}),
  };
}
