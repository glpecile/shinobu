import type { UpNextEntry, UpNextEpisode, UpNextEpisodeEntry } from '@/features/up-next/types';
import type { NormalizedMediaItem } from '@/types/media';
import type { LogMediaVariables } from './fan-out';

/**
 * A log the user confirmed that no provider read shows yet: its write is in
 * flight, its refetch has not landed, or it waits in the pending queue. The
 * screens draw it as watched now. It is display state only. A failed write
 * drops it, and the screens return to what the providers say.
 */
export interface LoggedWatch {
  item: NormalizedMediaItem;
  /** Canonical episodes the log covers. */
  episodes: readonly { season: number; number: number }[];
  /** Entry-relative episodes the log covers (AniList, Simkl anime). */
  entryEpisodes: readonly number[];
  /** The next aired, unwatched episode, when the catch-up chain proved one. */
  next?: Pick<UpNextEpisode, 'season' | 'number' | 'title'>;
}

/** Null for a film or a book: only episodes are drawn ahead of the providers. */
export function loggedWatch(
  variables: Pick<LogMediaVariables, 'item' | 'episode' | 'episodes' | 'entryEpisodes'>,
  next?: LoggedWatch['next'],
): LoggedWatch | null {
  const episodes = variables.episodes ?? (variables.episode != null ? [variables.episode] : []);
  const entryEpisodes = variables.entryEpisodes ?? [];
  if (episodes.length + entryEpisodes.length === 0) return null;
  return { item: variables.item, episodes, entryEpisodes, ...(next != null ? { next } : {}) };
}

/**
 * The same show on any tracker. TMDB ids are left out: every AniList cour of
 * one show can carry the show's TMDB id, and a log of one cour is not a log
 * of the others.
 */
function sameMedia(a: NormalizedMediaItem, b: NormalizedMediaItem): boolean {
  if (a.id === b.id) return true;
  const x = a.externalIds;
  const y = b.externalIds;
  return (
    (x.trakt != null && x.trakt === y.trakt) ||
    (x.anilist != null && x.anilist === y.anilist) ||
    (x.simkl != null && x.simkl === y.simkl)
  );
}

function covers(watches: readonly LoggedWatch[], episode: Pick<UpNextEpisode, 'season' | 'number'>): boolean {
  return watches.some((watch) =>
    episode.season != null
      ? watch.episodes.some((logged) => logged.season === episode.season && logged.number === episode.number)
      : watch.entryEpisodes.includes(episode.number),
  );
}

/**
 * The episode a card moves to after its own was logged, or null when none is
 * provable. A guessed episode is never shown: the chain's proven next wins,
 * then an unseasoned entry counts forward while its backlog count lasts. A
 * seasoned entry can't count forward, because the next number may belong to
 * another season.
 */
function advance(entry: UpNextEpisodeEntry, watches: readonly LoggedWatch[]): UpNextEpisodeEntry | null {
  const proven = watches.map((watch) => watch.next).find((next) => next != null && !covers(watches, next));
  const behind = entry.episodesBehind;
  if (proven != null) {
    return {
      ...entry,
      episode: proven,
      ...(behind != null ? { episodesBehind: Math.max(1, behind - 1) } : {}),
    };
  }
  if (entry.episode.season != null || behind == null) return null;
  let number = entry.episode.number + 1;
  while (covers(watches, { number })) number += 1;
  const left = behind - (number - entry.episode.number);
  return left < 1 ? null : { ...entry, episode: { number }, episodesBehind: left };
}

/**
 * Continue Watching with the logged episodes applied: a card whose episode
 * was logged moves to the next provable one, or leaves the rail. Returns
 * `entries` itself when no card changes.
 */
export function withLoggedEpisodes(entries: UpNextEntry[], logged: readonly LoggedWatch[]): UpNextEntry[] {
  if (logged.length === 0) return entries;
  let changed = false;
  const next = entries.flatMap((entry): UpNextEntry[] => {
    if (entry.kind !== 'episode') return [entry];
    const watches = logged.filter(
      (watch) => sameMedia(watch.item, entry.item) || entry.twinIds?.includes(watch.item.id) === true,
    );
    if (!covers(watches, entry.episode)) return [entry];
    changed = true;
    const advanced = advance(entry, watches);
    return advanced == null ? [] : [advanced];
  });
  return changed ? next : entries;
}

/**
 * `watched` plus the logged episodes of `item`, as `season-number` keys. An
 * entry-relative episode keys under season 1, as the anime rows do. Returns
 * `watched` itself when nothing is added.
 */
export function withLoggedKeys(
  watched: ReadonlySet<string>,
  item: NormalizedMediaItem,
  logged: readonly LoggedWatch[],
): ReadonlySet<string> {
  const keys = logged
    .filter((watch) => sameMedia(watch.item, item))
    .flatMap((watch) => [
      ...watch.episodes.map((episode) => `${episode.season}-${episode.number}`),
      ...watch.entryEpisodes.map((number) => `1-${number}`),
    ])
    .filter((key) => !watched.has(key));
  return keys.length === 0 ? watched : new Set([...watched, ...keys]);
}
