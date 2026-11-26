import { Provider } from '@/lib/providers/types';
import { hasAired, parseLocalInstant } from '@/lib/time/has-aired';
import { formatDayHeading, localDayAt, localDayOffset } from '@/lib/time/relative-day';
import type { NormalizedMediaItem } from '@/types/media';

import { isNewEpisode } from './badges';
import { entryInstant } from './entry';
import type {
  AniListUpNextInput,
  CalendarUpNextInput,
  ProgressUpNextInput,
  ReleaseUpNextInput,
  UpNextData,
  UpNextEntry,
  UpNextInputs,
} from './types';

/** Capped by Trakt's 1000 req / 5 min authed rate limit (docs/solutions/trakt-watched-endpoints-2026-api-changes.md). */
const UP_NEXT_POOL_SIZE = 20;

export const UP_NEXT_WINDOW_DAYS = 7;

export function withinPremiereWindow(date: string | null | undefined, now: Date): boolean {
  const instant = date == null ? null : parseLocalInstant(date);
  return (
    instant != null && now.getTime() - instant.getTime() <= UP_NEXT_WINDOW_DAYS * 24 * 60 * 60_000
  );
}

export function selectUpNextPool(
  watchedShows: readonly NormalizedMediaItem[],
  limit: number = UP_NEXT_POOL_SIZE,
): NormalizedMediaItem[] {
  return [...watchedShows]
    .sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated))
    .slice(0, Math.max(0, limit));
}

function entryId(item: NormalizedMediaItem, season: number | undefined, number: number) {
  return season == null ? `${item.id}-e${number}` : `${item.id}-s${season}e${number}`;
}

function progressEntry(input: ProgressUpNextInput, now: Date): UpNextEntry | null {
  const next = input.nextEpisode;
  if (next == null) return null;
  const behind =
    input.episodesBehind != null && input.episodesBehind > 0
      ? { episodesBehind: input.episodesBehind }
      : {};
  if (next.firstAired == null) {
    if (input.nextEpisodeAiredByCount !== true) return null;
    return {
      kind: 'episode',
      id: entryId(input.item, next.season, next.number),
      item: input.item,
      episode: {
        ...(next.season != null ? { season: next.season } : {}),
        number: next.number,
        ...(next.title != null ? { title: next.title } : {}),
        ...(next.runtime != null ? { runtime: next.runtime } : {}),
      },
      status: 'aired',
      source: input.source,
      ...behind,
    };
  }
  if (!hasAired(next.firstAired, now)) return null;

  return {
    kind: 'episode',
    id: entryId(input.item, next.season, next.number),
    item: input.item,
    episode: {
      ...(next.season != null ? { season: next.season } : {}),
      number: next.number,
      ...(next.title != null ? { title: next.title } : {}),
      firstAired: next.firstAired,
      ...(next.runtime != null ? { runtime: next.runtime } : {}),
    },
    status: 'aired',
    source: input.source,
    ...behind,
  };
}

function calendarEntry(input: CalendarUpNextInput, now: Date): UpNextEntry | null {
  const { episode } = input;
  if (hasAired(episode.firstAired, now)) return null;

  return {
    kind: 'episode',
    id: entryId(input.item, episode.season, episode.number),
    item: input.item,
    episode: {
      ...(episode.season != null ? { season: episode.season } : {}),
      number: episode.number,
      ...(episode.title != null ? { title: episode.title } : {}),
      ...(episode.firstAired != null ? { firstAired: episode.firstAired } : {}),
      ...(episode.runtime != null ? { runtime: episode.runtime } : {}),
      ...(input.finale != null ? { finale: input.finale } : {}),
    },
    status: 'upcoming',
    source: input.source,
  };
}

function releaseEntry(input: ReleaseUpNextInput): UpNextEntry {
  return {
    kind: 'release',
    id: `${input.item.id}-${input.kind}`,
    item: input.item,
    release: { kind: input.kind, date: input.date },
    status: 'upcoming',
    source: input.source,
  };
}

/** AniList exposes only a single `nextAiringEpisode` pointer per series, not per-episode instants. */
function classifyAnilistEntry(input: AniListUpNextInput, now: Date): UpNextEntry | null {
  if (input.item.isFilm === true) return null;
  const next = input.item.currentProgress + 1;
  const total = input.totalEpisodes;
  if (total != null && next > total) return null;

  const airing = input.nextAiring;
  const base = {
    kind: 'episode' as const,
    id: entryId(input.item, undefined, next),
    item: input.item,
    // Omit season: AniList episode numbers are entry-relative, not canonical seasons.
    episode: { number: next },
    source: Provider.AniList,
  };

  if (airing == null) {
    if (total == null) return null;
    return {
      ...base,
      status: 'aired',
      episodesBehind: total - input.item.currentProgress,
    };
  }
  if (next < airing.episode) {
    return {
      ...base,
      status: 'aired',
      episodesBehind: airing.episode - 1 - input.item.currentProgress,
    };
  }
  if (next > airing.episode) return null;

  const aired = hasAired(airing.airingAt, now);
  return {
    ...base,
    episode: { ...base.episode, firstAired: airing.airingAt },
    status: aired ? 'aired' : 'upcoming',
    ...(aired ? { episodesBehind: 1 } : {}),
  };
}

function anilistEntry(input: AniListUpNextInput, now: Date): UpNextEntry | null {
  const entry = classifyAnilistEntry(input, now);
  if (entry == null) return null;
  if (input.status === 'PLANNING' && entry.status !== 'upcoming') {
    if (input.hasUnfinishedPrequel === true) return null;
    const premiere =
      input.firstAired ?? (input.nextAiring?.episode === 1 ? input.nextAiring.airingAt : undefined);
    if (premiere == null || !hasAired(premiere, now)) return null;
    if (!withinPremiereWindow(premiere, now)) return null;
  }
  return entry;
}

export interface UpNextDayGroup {
  offset: number;
  date: Date;
  label: string;
  entries: UpNextEntry[];
}

export function calendarWeek(entries: readonly UpNextEntry[], now: Date): UpNextDayGroup[] {
  return Array.from({ length: UP_NEXT_WINDOW_DAYS }, (_, offset) => {
    const date = localDayAt(offset, now);
    return {
      offset,
      date,
      label: formatDayHeading(offset, date),
      entries: entries.filter((entry) => localDayOffset(entryInstant(entry), now) === offset),
    };
  });
}

function inCalendarWindow(entry: UpNextEntry, now: Date): boolean {
  const offset = localDayOffset(entryInstant(entry), now);
  return offset != null && offset >= 0 && offset < UP_NEXT_WINDOW_DAYS;
}

function dedupeTrackerEpisodes(entries: readonly UpNextEntry[]): UpNextEntry[] {
  const simklByKey = new Map<string, UpNextEntry[]>();
  for (const entry of entries) {
    if (entry.kind !== 'episode' || entry.source !== Provider.Simkl) continue;
    for (const key of identityKeys(entry.item.externalIds)) {
      const slot = `${key}:${entry.status}`;
      simklByKey.set(slot, [...(simklByKey.get(slot) ?? []), entry]);
    }
  }
  if (simklByKey.size === 0) return [...entries];
  const twins = new Map<UpNextEntry, UpNextEntry[]>();
  const kept = entries.filter((entry) => {
    if (entry.kind !== 'episode' || entry.source === Provider.Simkl) return true;
    const winners = new Set(
      identityKeys(entry.item.externalIds).flatMap(
        (key) => simklByKey.get(`${key}:${entry.status}`) ?? [],
      ),
    );
    for (const winner of winners) twins.set(winner, [...(twins.get(winner) ?? []), entry]);
    return winners.size === 0;
  });
  return kept.map((entry) => withTwins(entry, twins.get(entry)));
}

function withTwins(winner: UpNextEntry, losers: readonly UpNextEntry[] | undefined): UpNextEntry {
  if (losers == null) return winner;
  const twinIds = losers.flatMap((loser) => [loser.item.id, ...(loser.twinIds ?? [])]);
  return { ...winner, twinIds: [...(winner.twinIds ?? []), ...twinIds] };
}

/** Simkl's anime calendar often omits `tmdb` and only provides `tvdb`/`imdb`/`mal`; namespace keys so numeric IDs across services cannot collide. */
export function identityKeys(ids: UpNextEntry['item']['externalIds']): string[] {
  const keys: string[] = [];
  if (ids.tmdb != null) keys.push(`tmdb:${ids.tmdb}`);
  if (ids.tvdb != null) keys.push(`tvdb:${ids.tvdb}`);
  if (ids.imdb != null) keys.push(`imdb:${ids.imdb}`);
  if (ids.mal != null) keys.push(`mal:${ids.mal}`);
  if (ids.anilist != null) keys.push(`anilist:${ids.anilist}`);
  return keys;
}

function dedupeByTmdb(
  anilist: readonly UpNextEntry[],
  others: readonly UpNextEntry[],
  anilistByKey: ReadonlyMap<string, readonly UpNextEntry[]>,
): UpNextEntry[] {
  const twins = new Map<UpNextEntry, UpNextEntry[]>();
  const kept = others.filter((entry) => {
    // TMDB movie and TV IDs share numeric spaces and can collide; AniList never emits film releases.
    if (entry.kind !== 'episode') return true;
    const winners = new Set(
      identityKeys(entry.item.externalIds).flatMap((key) => anilistByKey.get(key) ?? []),
    );
    for (const winner of winners) twins.set(winner, [...(twins.get(winner) ?? []), entry]);
    return winners.size === 0;
  });
  const enriched = anilist.map((entry) => {
    const ids = entry.item.externalIds;
    let item = entry.item;
    for (const other of others) {
      if (other.kind !== 'episode') continue;
      const otherIds = other.item.externalIds;
      if (
        (ids.anilist != null && ids.anilist === otherIds.anilist) ||
        (ids.mal != null && ids.mal === otherIds.mal)
      ) {
        item = { ...item, externalIds: { ...otherIds, ...item.externalIds } };
      }
    }
    return withTwins(item === entry.item ? entry : { ...entry, item }, twins.get(entry));
  });
  return dedupeReleases([...enriched, ...kept]);
}

function dedupeReleases(entries: readonly UpNextEntry[]): UpNextEntry[] {
  const winners = new Map<string, UpNextEntry>();
  const joined = new Map<number, Set<string>>();
  const kept = entries.filter((entry) => {
    if (entry.kind !== 'release') return true;
    const tmdbId = entry.item.externalIds.tmdb;
    if (tmdbId == null) return true;
    const key = `${tmdbId}-${entry.release.kind}`;
    const winner = winners.get(key);
    if (winner == null) {
      winners.set(key, entry);
      return true;
    }
    joined.set(tmdbId, (joined.get(tmdbId) ?? new Set()).add(winner.item.id).add(entry.item.id));
    return false;
  });
  if (joined.size === 0) return kept;
  return kept.map((entry) => {
    const tmdbId = entry.kind === 'release' ? entry.item.externalIds.tmdb : undefined;
    const ids = tmdbId == null ? undefined : joined.get(tmdbId);
    if (ids == null || !ids.has(entry.item.id)) return entry;
    return { ...entry, twinIds: [...ids].filter((id) => id !== entry.item.id) };
  });
}

/** Parse before comparing: episodes carry UTC ISO instants while releases carry bare local `YYYY-MM-DD` dates, so string comparison mis-orders them. */
function entryOrder(entry: UpNextEntry): number {
  const instant = entryInstant(entry);
  const parsed = instant == null ? null : parseLocalInstant(instant);
  return parsed?.getTime() ?? Number.POSITIVE_INFINITY;
}

function continueWatchingOrder(a: UpNextEntry, b: UpNextEntry, now: Date): number {
  const aNew = isNewEpisode(a, now);
  const bNew = isNewEpisode(b, now);
  if (aNew !== bNew) return aNew ? -1 : 1;
  if (aNew) return entryOrder(b) - entryOrder(a);
  return b.item.lastUpdated.localeCompare(a.item.lastUpdated);
}

/** Epoch ms of the next upcoming airing or local midnight. */
export function nextSplitChange(calendar: readonly UpNextEntry[], now: Date): number {
  const airings = calendar.flatMap((entry) => {
    const instant = entryInstant(entry);
    const time = instant == null ? null : parseLocalInstant(instant)?.getTime();
    return time != null && time > now.getTime() ? [time] : [];
  });
  return Math.min(localDayAt(1, now).getTime(), ...airings);
}

export function computeUpNext(inputs: UpNextInputs, now: Date): UpNextData {
  const anilistPairs = inputs.anilist
    .map((input) => ({ input, entry: anilistEntry(input, now) }))
    .filter(
      (pair): pair is { input: AniListUpNextInput; entry: UpNextEntry } => pair.entry != null,
    );
  const anilistEntries = anilistPairs.map((pair) => pair.entry);
  const episodeEntries = dedupeTrackerEpisodes([
    ...inputs.progress
      .map((input) => progressEntry(input, now))
      .filter((entry): entry is UpNextEntry => entry != null),
    ...inputs.calendar
      .map((input) => calendarEntry(input, now))
      .filter((entry): entry is UpNextEntry => entry != null),
  ]);
  const releaseEntries = inputs.releases.map(releaseEntry);

  const anilistByKey = new Map<string, UpNextEntry[]>();
  for (const pair of anilistPairs) {
    const keys = identityKeys({
      ...pair.input.item.externalIds,
      ...(pair.input.tmdbId != null ? { tmdb: pair.input.tmdbId } : {}),
    });
    for (const key of keys) anilistByKey.set(key, [...(anilistByKey.get(key) ?? []), pair.entry]);
  }

  const entries = dedupeByTmdb(
    anilistEntries,
    [...episodeEntries, ...releaseEntries],
    anilistByKey,
  );

  return {
    continueWatching: entries
      .filter((entry) => entry.status === 'aired')
      .sort((a, b) => continueWatchingOrder(a, b, now)),
    calendar: entries
      .filter((entry) => entry.status === 'upcoming' && inCalendarWindow(entry, now))
      .sort((a, b) => entryOrder(a) - entryOrder(b)),
  };
}
