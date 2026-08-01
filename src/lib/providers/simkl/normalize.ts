import type { MediaType, NormalizedMediaItem } from '@/types/media';

/**
 * Raw Simkl payload shapes — these never escape lib/providers (AGENTS.md Data
 * Contract). Endpoint shapes verified against https://api.simkl.org and live
 * CDN probes on 2026-07-31 (plan 0034 U3).
 */

/**
 * The id bag Simkl attaches to media objects. `/sync/all-items` and
 * `/search/id` key it `simkl`; the CDN files (trending, calendar metadata) key
 * it `simkl_id` — both are accepted here. Numeric bridge ids (tmdb, tvdb, mal,
 * anilist) arrive as strings on the CDN surfaces and as numbers elsewhere, so
 * every one of them is coerced defensively.
 */
export interface SimklIds {
  simkl?: number;
  simkl_id?: number;
  slug?: string;
  tmdb?: number | string;
  tvdb?: number | string;
  imdb?: string;
  mal?: number | string;
  anilist?: number | string;
  anidb?: number | string;
}

/** The `show`/`movie` object embedded in a `/sync/all-items` entry. */
export interface SimklMediaSummary {
  title?: string | null;
  /** CDN path fragment (e.g. "12/127230752d75bc8c3a"), not a URL. */
  poster?: string | null;
  fanart?: string | null;
  year?: number | null;
  ids?: SimklIds;
  /** Anime entries only: `tv`, `movie`, `ova`, `ona`, `special`, … */
  anime_type?: string | null;
}

export interface SimklAllItemsEpisode {
  number: number;
  /** ISO instant; present with `episode_watched_at=yes`. */
  watched_at?: string | null;
}

export interface SimklAllItemsSeason {
  number: number;
  episodes?: SimklAllItemsEpisode[];
}

/**
 * From `next_watch_info=yes`: the next episode *with its air instant* — the
 * field U8's Up Next leg needs (`next_to_watch` alone is a bare "S##E##"
 * pointer). `season` is omitted for anime (absolute numbering). Populated for
 * `plantowatch` rows too, not just `watching` ones (verified on device, plan
 * 0036 U8) — which is what lets a parked part-watched show reach Continue
 * Watching and keep its details-screen log button.
 */
export interface SimklNextToWatchInfoRaw {
  title?: string | null;
  season?: number;
  episode?: number;
  /** ISO instant with offset, or null when Simkl has no air date. */
  date?: string | null;
}

export interface SimklAllItemsEntry {
  status?: string;
  watched_episodes_count?: number;
  total_episodes_count?: number;
  not_aired_episodes_count?: number;
  added_to_watchlist_at?: string | null;
  last_watched_at?: string | null;
  /** "S##E##" pointer or null. */
  last_watched?: string | null;
  /** "S##E##" pointer or null — no air date; see next_to_watch_info. */
  next_to_watch?: string | null;
  next_to_watch_info?: SimklNextToWatchInfoRaw | null;
  seasons?: SimklAllItemsSeason[];
  show?: SimklMediaSummary;
  movie?: SimklMediaSummary;
}

/** `/sync/all-items` — keys absent when the bucket is empty; `{}` when all are. */
export interface SimklAllItemsResponse {
  shows?: SimklAllItemsEntry[];
  movies?: SimklAllItemsEntry[];
  anime?: SimklAllItemsEntry[];
}

export type SimklLibraryBucket = 'shows' | 'movies' | 'anime';

export type SimklWatchStatus =
  | 'watching'
  | 'plantowatch'
  | 'hold'
  | 'completed'
  | 'dropped';

const SIMKL_WATCH_STATUSES: readonly SimklWatchStatus[] = [
  'watching',
  'plantowatch',
  'hold',
  'completed',
  'dropped',
];

/** One watched episode with its instant (from `episode_watched_at=yes`). */
export interface SimklWatchedEpisode {
  season: number;
  number: number;
  /** ISO instant, verbatim; absent when Simkl didn't record one. */
  watchedAt?: string;
}

/** The next unwatched episode, air instant included when Simkl knows it. */
export interface SimklNextToWatch {
  /** Absent for anime — Simkl numbers anime absolutely (AniDB convention). */
  season?: number;
  episode: number;
  title?: string;
  /**
   * ISO instant with offset, or `null` when Simkl knows the episode but not
   * its air date. Carried rather than dropped so U8 can exclude it knowingly
   * (an unknown air date is not "not aired yet") — same contract as Trakt's
   * `TraktNextEpisode.firstAired`.
   */
  date: string | null;
}

/**
 * One `/sync/all-items` entry: the flat feed item plus the provider-shaped
 * facts (status, per-episode watched instants, next-to-watch pointer) that
 * U7/U8 consume. Provider-shaped detail lives *beside* the item, never on it —
 * the `AniListCurrentEntry` precedent.
 */
export interface SimklLibraryEntry {
  item: NormalizedMediaItem;
  status: SimklWatchStatus;
  addedToWatchlistAt?: string;
  lastWatchedAt?: string;
  /** `"${season}-${number}"` for every watched episode (Trakt key format). */
  watchedKeys: ReadonlySet<string>;
  watchedEpisodes: SimklWatchedEpisode[];
  nextToWatch?: SimklNextToWatch;
  /**
   * `not_aired_episodes_count` — how many of `totalEpisodes` are still unaired.
   * Carried so Up Next (plan 0034 U8) can prove a null-date `nextToWatch`
   * pointer aired by arithmetic (`watched < total - notAired`) instead of
   * guessing from the pointer alone.
   */
  notAiredEpisodes?: number;
}

export interface SimklLibrary {
  shows: SimklLibraryEntry[];
  movies: SimklLibraryEntry[];
  anime: SimklLibraryEntry[];
}

// ---- Calendar (CDN JSON, plan 0034 KTD-4) ----

export interface SimklCalendarEpisodeRaw {
  season?: number;
  episode?: number;
  title?: string | null;
  url?: string;
}

export interface SimklCalendarEntryRaw {
  simkl_id?: number;
  /** ISO UTC instant with trailing Z. */
  date?: string;
  /** 1 = mid-season, 2 = season, 3 = series finale; null = regular airing. */
  finale_type?: number | null;
  /** TV/anime only — movie_release entries carry no episode object. */
  episode?: SimklCalendarEpisodeRaw | null;
}

export interface SimklCalendarMetadataRaw {
  title?: string;
  poster?: string | null;
  fanart?: string | null;
  ids?: SimklIds;
  anime_type?: string | null;
  total_episodes?: number | null;
}

export interface SimklCalendarFile {
  calendar?: SimklCalendarEntryRaw[];
  /** Keyed by `simkl_id` as a string. */
  metadata?: Record<string, SimklCalendarMetadataRaw | undefined>;
}

export type SimklFinaleType = 'midseason' | 'season' | 'series';

/**
 * One dated airing/release from the CDN calendar, metadata joined in — the
 * shape U8 intersects with the user's library. `date` is the file's UTC
 * instant **verbatim** (the has-aired.ts contract: never reformat, never
 * localize).
 */
export interface SimklCalendarEntry {
  simklId: number;
  /** ISO UTC instant, byte-for-byte as the CDN file states it. */
  date: string;
  finaleType?: SimklFinaleType;
  /** Absent on movie_release entries; `season` absent on anime. */
  episode?: { season?: number; number: number; title?: string };
  /** '' when the file carries no metadata for this id. */
  title: string;
  /** Full poster URL; '' when unavailable. */
  poster: string;
  externalIds: NormalizedMediaItem['externalIds'];
  animeType?: string;
  totalEpisodes?: number;
}

// ---- Trending (CDN JSON, plan 0034 KTD-8) ----

/** One item of `/discover/trending/{kind}/{interval}_100.json`. */
export interface SimklTrendingItem {
  title?: string;
  poster?: string | null;
  fanart?: string | null;
  overview?: string | null;
  /** `MM/DD/YYYY` — a calendar date, not an instant (live probe 2026-07-31). */
  release_date?: string | null;
  genres?: string[];
  total_episodes?: number | null;
  anime_type?: string | null;
  ratings?: { simkl?: { rating?: number | null; votes?: number | null } | null } | null;
  ids?: SimklIds;
}

export type SimklTrendingKind = 'movies' | 'tv' | 'anime';

// ---- Search by id ----

/** One `/search/id` match — its `ids` carry only `simkl` + `slug`. */
export interface SimklSearchIdMatch {
  type?: string;
  title?: string;
  poster?: string | null;
  year?: number | null;
  total_episodes?: number | null;
  anime_type?: string | null;
  ids?: SimklIds;
  /** MAL bridge object, distinct from `ids` in this response only. */
  mal?: { id?: number | string } | null;
}

// ---- Activities ----

interface SimklActivityBucketRaw {
  all?: string | null;
  removed_from_list?: string | null;
}

export interface SimklActivitiesRaw {
  all?: string | null;
  tv_shows?: SimklActivityBucketRaw | null;
  anime?: SimklActivityBucketRaw | null;
  movies?: SimklActivityBucketRaw | null;
}

export interface SimklActivityBucket {
  all: string | null;
  removedFromList: string | null;
}

/** The cache-invalidation signal (KTD-5): compare, then refetch on delta. */
export interface SimklActivities {
  all: string | null;
  tvShows: SimklActivityBucket;
  anime: SimklActivityBucket;
  movies: SimklActivityBucket;
}

// ---- User settings ----

export interface SimklUserSettingsRaw {
  user?: { name?: string | null; avatar?: string | null } | null;
  account?: {
    id?: number | null;
    timezone?: string | null;
    type?: string | null;
  } | null;
}

export interface SimklUserSettings {
  username: string | null;
  avatar?: string;
  accountId?: number;
  timezone?: string;
}

// ---- Image URLs ----

/**
 * Simkl image fragments compose against the simkl.in CDN with a size suffix
 * (api.simkl.org/conventions/images). The docs route through a wsrv.nl
 * resizing proxy, but the direct host serves the same files (live probe
 * 2026-07-31: 200 image/webp) — no third-party proxy dependency. `_m` is the
 * 340-wide poster, comparable to TMDB's w342 used elsewhere.
 */
export function simklPosterUrl(fragment: string | null | undefined): string {
  if (fragment == null || fragment === '') return '';
  return `https://simkl.in/posters/${fragment}_m.webp`;
}

/** `_mobile` is the 960×540 fanart — comparable to TMDB's w780 backdrop. */
export function simklFanartUrl(fragment: string | null | undefined): string {
  if (fragment == null || fragment === '') return '';
  return `https://simkl.in/fanart/${fragment}_mobile.webp`;
}

// ---- Shared helpers ----

/**
 * CDN surfaces send numeric ids as strings, and at least one field has shipped
 * corrupted (a trending `anidb` carrying prose — live probe 2026-07-31), so a
 * junk value drops rather than becoming `NaN` in `externalIds`.
 */
function numericId(value: number | string | null | undefined): number | undefined {
  if (value == null) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function simklIdFrom(ids: SimklIds | undefined): number | undefined {
  return numericId(ids?.simkl ?? ids?.simkl_id);
}

/** mal/simkl join tmdb/tvdb/imdb as bridge ids (plan 0034 KTD-6). */
function externalIdsFrom(ids: SimklIds | undefined): NormalizedMediaItem['externalIds'] {
  const simkl = simklIdFrom(ids);
  const tmdb = numericId(ids?.tmdb);
  const tvdb = numericId(ids?.tvdb);
  const mal = numericId(ids?.mal);
  const anilist = numericId(ids?.anilist);
  return {
    ...(simkl != null ? { simkl } : {}),
    ...(tmdb != null ? { tmdb } : {}),
    ...(tvdb != null ? { tvdb } : {}),
    ...(mal != null ? { mal } : {}),
    ...(anilist != null ? { anilist } : {}),
    ...(ids?.imdb != null && ids.imdb !== '' ? { imdb: ids.imdb } : {}),
  };
}

/**
 * Simkl's three buckets onto `MediaType`: `movies` → MOVIE, `shows` → TV,
 * `anime` → ANIME — with `anime_type: "movie"` flagging `isFilm`, the same
 * reasoning that routes anime films to the movie fan-out targets (plan 0034
 * R4; AGENTS.md "Routing isn't a 1:1 type map").
 */
function mediaTypeFor(
  bucket: SimklLibraryBucket,
  animeType: string | null | undefined,
): { type: MediaType; isFilm?: true } {
  if (bucket === 'movies') return { type: 'MOVIE' };
  if (bucket === 'shows') return { type: 'TV' };
  return animeType === 'movie' ? { type: 'ANIME', isFilm: true } : { type: 'ANIME' };
}

// ---- Library (all-items) ----

/** "S02E05" → { season: 2, episode: 5 }; anything else is unusable. */
function parseEpisodePointer(
  pointer: string | null | undefined,
): { season: number; episode: number } | undefined {
  const match = pointer?.match(/^S(\d+)E(\d+)$/i);
  if (match == null) return undefined;
  return { season: Number(match[1]), episode: Number(match[2]) };
}

function nextToWatchFrom(raw: SimklAllItemsEntry): SimklNextToWatch | undefined {
  const info = raw.next_to_watch_info;
  if (info?.episode != null) {
    return {
      ...(info.season != null ? { season: info.season } : {}),
      episode: info.episode,
      ...(info.title != null && info.title !== '' ? { title: info.title } : {}),
      date: info.date != null && info.date !== '' ? info.date : null,
    };
  }
  // Where Simkl states no `next_to_watch_info` block only the bare pointer
  // exists — carried with a null air date, never a guessed one.
  const parsed = parseEpisodePointer(raw.next_to_watch);
  if (parsed == null) return undefined;
  return { season: parsed.season, episode: parsed.episode, date: null };
}

function watchedEpisodesFrom(raw: SimklAllItemsEntry): SimklWatchedEpisode[] {
  const episodes: SimklWatchedEpisode[] = [];
  for (const season of raw.seasons ?? []) {
    for (const episode of season.episodes ?? []) {
      episodes.push({
        season: season.number,
        number: episode.number,
        ...(episode.watched_at != null && episode.watched_at !== ''
          ? { watchedAt: episode.watched_at }
          : {}),
      });
    }
  }
  return episodes;
}

export function normalizeLibraryEntry(
  raw: SimklAllItemsEntry,
  bucket: SimklLibraryBucket,
  nowIso: string,
): SimklLibraryEntry | null {
  const media = raw.show ?? raw.movie;
  const simklId = simklIdFrom(media?.ids);
  // No id or no title → not renderable, not routable; the row drops rather
  // than failing the library read (the Trakt search-row tolerance).
  if (media == null || simklId == null || media.title == null || media.title === '') {
    return null;
  }
  const status = SIMKL_WATCH_STATUSES.find((known) => known === raw.status);
  if (status == null) return null;

  const { type, isFilm } = mediaTypeFor(bucket, media.anime_type);
  const watchedEpisodes = watchedEpisodesFrom(raw);
  const watchedCount =
    raw.watched_episodes_count ??
    // Movies carry no episode count; a completed movie is one play.
    (type === 'MOVIE' && status === 'completed' ? 1 : 0);
  const lastWatchedAt =
    raw.last_watched_at != null && raw.last_watched_at !== ''
      ? raw.last_watched_at
      : undefined;
  const addedToWatchlistAt =
    raw.added_to_watchlist_at != null && raw.added_to_watchlist_at !== ''
      ? raw.added_to_watchlist_at
      : undefined;
  const nextToWatch = nextToWatchFrom(raw);

  return {
    item: {
      id: `simkl-${simklId}`,
      title: media.title,
      coverImage: simklPosterUrl(media.poster),
      ...(media.fanart != null && media.fanart !== ''
        ? { backdropImage: simklFanartUrl(media.fanart) }
        : {}),
      ...(media.year != null ? { year: media.year } : {}),
      type,
      ...(isFilm ? { isFilm } : {}),
      currentProgress: watchedCount,
      progressUnit: 'episode',
      ...(raw.total_episodes_count != null
        ? { totalEpisodes: raw.total_episodes_count }
        : {}),
      lastUpdated: lastWatchedAt ?? addedToWatchlistAt ?? nowIso,
      externalIds: externalIdsFrom(media.ids),
    },
    status,
    ...(addedToWatchlistAt != null ? { addedToWatchlistAt } : {}),
    ...(lastWatchedAt != null ? { lastWatchedAt } : {}),
    ...(raw.not_aired_episodes_count != null
      ? { notAiredEpisodes: raw.not_aired_episodes_count }
      : {}),
    watchedKeys: new Set(
      watchedEpisodes.map((episode) => `${episode.season}-${episode.number}`),
    ),
    watchedEpisodes,
    ...(nextToWatch != null ? { nextToWatch } : {}),
  };
}

export function normalizeAllItems(
  raw: SimklAllItemsResponse,
  nowIso: string,
): SimklLibrary {
  const bucket = (key: SimklLibraryBucket): SimklLibraryEntry[] =>
    (raw[key] ?? [])
      .map((entry) => normalizeLibraryEntry(entry, key, nowIso))
      .filter((entry): entry is SimklLibraryEntry => entry != null);
  return { shows: bucket('shows'), movies: bucket('movies'), anime: bucket('anime') };
}

// ---- Calendar ----

const FINALE_TYPES: Record<number, SimklFinaleType> = {
  1: 'midseason',
  2: 'season',
  3: 'series',
};

export function normalizeCalendarFile(raw: SimklCalendarFile): SimklCalendarEntry[] {
  const metadata = raw.metadata ?? {};
  const entries: SimklCalendarEntry[] = [];
  for (const entry of raw.calendar ?? []) {
    const simklId = entry.simkl_id;
    const date = entry.date;
    // A calendar entry exists *because* it airs at an instant tied to a title;
    // without either it can't be intersected or bucketed, so it drops.
    if (simklId == null || date == null || date === '') continue;

    const meta = metadata[String(simklId)];
    const finaleType =
      entry.finale_type != null ? FINALE_TYPES[entry.finale_type] : undefined;
    const episode =
      entry.episode?.episode != null
        ? {
            ...(entry.episode.season != null ? { season: entry.episode.season } : {}),
            number: entry.episode.episode,
            ...(entry.episode.title != null && entry.episode.title !== ''
              ? { title: entry.episode.title }
              : {}),
          }
        : undefined;

    entries.push({
      simklId,
      date,
      ...(finaleType != null ? { finaleType } : {}),
      ...(episode != null ? { episode } : {}),
      // An entry the metadata map doesn't cover still carries its id — U8
      // renders it from the user's own library metadata instead of dropping
      // a tracked show's airing.
      title: meta?.title ?? '',
      poster: simklPosterUrl(meta?.poster),
      externalIds:
        meta?.ids != null ? externalIdsFrom(meta.ids) : { simkl: simklId },
      ...(meta?.anime_type != null ? { animeType: meta.anime_type } : {}),
      ...(meta?.total_episodes != null ? { totalEpisodes: meta.total_episodes } : {}),
    });
  }
  return entries;
}

// ---- Trending ----

const TRENDING_MEDIA_TYPE: Record<SimklTrendingKind, SimklLibraryBucket> = {
  movies: 'movies',
  tv: 'shows',
  anime: 'anime',
};

/**
 * `MM/DD/YYYY` → bare ISO `YYYY-MM-DD`. A pure calendar-date re-spelling —
 * no timezone math, so the has-aired contract (bare dates parse as local
 * midnight downstream) is preserved. Anything else drops.
 */
function isoDateFromUs(date: string | null | undefined): string | undefined {
  const match = date?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match == null) return undefined;
  return `${match[3]}-${match[1]}-${match[2]}`;
}

export function normalizeTrendingItem(
  raw: SimklTrendingItem,
  kind: SimklTrendingKind,
  nowIso: string,
): NormalizedMediaItem | null {
  const simklId = simklIdFrom(raw.ids);
  if (simklId == null || raw.title == null || raw.title === '') return null;

  const { type, isFilm } = mediaTypeFor(TRENDING_MEDIA_TYPE[kind], raw.anime_type);
  const releaseDate = isoDateFromUs(raw.release_date);
  const rating = raw.ratings?.simkl?.rating;

  return {
    id: `simkl-${simklId}`,
    title: raw.title,
    coverImage: simklPosterUrl(raw.poster),
    ...(raw.fanart != null && raw.fanart !== ''
      ? { backdropImage: simklFanartUrl(raw.fanart) }
      : {}),
    ...(raw.overview != null && raw.overview !== '' ? { overview: raw.overview } : {}),
    // Trending items carry `year: null` but a populated release_date (live
    // probe 2026-07-31) — the year derives from it.
    ...(releaseDate != null ? { year: Number(releaseDate.slice(0, 4)) } : {}),
    ...(raw.genres != null && raw.genres.length > 0 ? { genres: raw.genres } : {}),
    ...(rating != null ? { rating } : {}),
    type,
    ...(isFilm ? { isFilm } : {}),
    ...(releaseDate != null ? { releaseDate } : {}),
    currentProgress: 0,
    progressUnit: 'episode',
    ...(raw.total_episodes != null ? { totalEpisodes: raw.total_episodes } : {}),
    lastUpdated: nowIso,
    externalIds: externalIdsFrom(raw.ids),
  };
}

// ---- Search by id ----

export function normalizeSearchIdMatch(
  raw: SimklSearchIdMatch,
  nowIso: string,
): NormalizedMediaItem | null {
  const simklId = simklIdFrom(raw.ids);
  if (simklId == null || raw.title == null || raw.title === '') return null;

  // Simkl types matches `movie` | `tv` | `anime`; anything else (should not
  // happen on /search/id) drops rather than mis-typing.
  const bucket: SimklLibraryBucket | undefined =
    raw.type === 'movie'
      ? 'movies'
      : raw.type === 'tv' || raw.type === 'show'
        ? 'shows'
        : raw.type === 'anime'
          ? 'anime'
          : undefined;
  if (bucket == null) return null;

  const { type, isFilm } = mediaTypeFor(bucket, raw.anime_type);
  // /search/id nests the MAL id under `mal.id`, outside `ids` — lifted so the
  // anime write path (KTD-6) sees one id bag.
  const mal = numericId(raw.mal?.id);

  return {
    id: `simkl-${simklId}`,
    title: raw.title,
    coverImage: simklPosterUrl(raw.poster),
    ...(raw.year != null ? { year: raw.year } : {}),
    type,
    ...(isFilm ? { isFilm } : {}),
    currentProgress: 0,
    progressUnit: 'episode',
    ...(raw.total_episodes != null ? { totalEpisodes: raw.total_episodes } : {}),
    lastUpdated: nowIso,
    externalIds: {
      ...externalIdsFrom(raw.ids),
      ...(mal != null ? { mal } : {}),
    },
  };
}

// ---- Activities ----

function activityBucket(
  raw: SimklActivityBucketRaw | null | undefined,
): SimklActivityBucket {
  return {
    all: raw?.all ?? null,
    removedFromList: raw?.removed_from_list ?? null,
  };
}

export function normalizeActivities(raw: SimklActivitiesRaw): SimklActivities {
  return {
    all: raw.all ?? null,
    tvShows: activityBucket(raw.tv_shows),
    anime: activityBucket(raw.anime),
    movies: activityBucket(raw.movies),
  };
}

// ---- User settings ----

/**
 * Null username rather than a failure when the payload doesn't carry one —
 * the caller degrades to a plain "Connected" line (the Trakt
 * `getViewerUsername` contract).
 */
export function normalizeUserSettings(raw: SimklUserSettingsRaw): SimklUserSettings {
  const avatar = raw.user?.avatar;
  const accountId = raw.account?.id;
  const timezone = raw.account?.timezone;
  return {
    username: raw.user?.name != null && raw.user.name !== '' ? raw.user.name : null,
    ...(avatar != null && avatar !== '' ? { avatar } : {}),
    ...(accountId != null ? { accountId } : {}),
    ...(timezone != null && timezone !== '' ? { timezone } : {}),
  };
}
