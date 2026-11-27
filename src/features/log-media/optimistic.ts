import type { UpNextEntry, UpNextEpisode, UpNextEpisodeEntry } from '@/features/up-next/types';
import type { NormalizedMediaItem } from '@/types/media';
import type { LogMediaVariables } from './fan-out';

export interface LoggedWatch {
  item: NormalizedMediaItem;
  episodes: readonly { season: number; number: number }[];
  entryEpisodes: readonly number[];
  next?: LogMediaVariables['next'];
}

export function loggedWatch(
  variables: Pick<LogMediaVariables, 'item' | 'episode' | 'episodes' | 'entryEpisodes' | 'next'>,
): LoggedWatch | null {
  const episodes = variables.episodes ?? (variables.episode != null ? [variables.episode] : []);
  const entryEpisodes = variables.entryEpisodes ?? [];
  if (episodes.length + entryEpisodes.length === 0) return null;
  const { next } = variables;
  return { item: variables.item, episodes, entryEpisodes, ...(next != null ? { next } : {}) };
}

/** Excludes TMDB ids: multiple AniList cours share one TMDB show id. */
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

function covers(
  watches: readonly LoggedWatch[],
  episode: Pick<UpNextEpisode, 'season' | 'number'>,
): boolean {
  return watches.some((watch) =>
    episode.season != null
      ? watch.episodes.some(
          (logged) => logged.season === episode.season && logged.number === episode.number,
        )
      : watch.entryEpisodes.includes(episode.number),
  );
}

function advance(
  entry: UpNextEpisodeEntry,
  watches: readonly LoggedWatch[],
): UpNextEpisodeEntry | null {
  const proven = watches
    .map((watch) => watch.next)
    .find((next) => next != null && !covers(watches, next));
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

export function withLoggedEpisodes(
  entries: UpNextEntry[],
  logged: readonly LoggedWatch[],
): UpNextEntry[] {
  if (logged.length === 0) return entries;
  let changed = false;
  const next = entries.flatMap((entry): UpNextEntry[] => {
    if (entry.kind !== 'episode') return [entry];
    const watches = logged.filter(
      (watch) =>
        sameMedia(watch.item, entry.item) || entry.twinIds?.includes(watch.item.id) === true,
    );
    if (!covers(watches, entry.episode)) return [entry];
    changed = true;
    const advanced = advance(entry, watches);
    return advanced == null ? [] : [advanced];
  });
  return changed ? next : entries;
}

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
