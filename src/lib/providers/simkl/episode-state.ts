import { hasAired } from '@/lib/time/has-aired';
import type { SimklLibraryEntry, SimklWatchedEpisode } from './normalize';

export interface SimklEpisodeState {
  watchedEpisodes: SimklWatchedEpisode[];
  watchedKeys: ReadonlySet<string>;
  completedSeasons: ReadonlySet<number>;
  completedAll: boolean;
}

/** Project cour-relative anime records into the season layout used by TV details. */
export function simklEpisodeState(entries: readonly SimklLibraryEntry[]): SimklEpisodeState {
  const episodes = new Map<string, SimklWatchedEpisode>();
  const completedSeasons = new Set<number>();
  let completedAll = false;
  for (const entry of entries) {
    const anime = entry.item.type === 'ANIME';
    for (const episode of entry.watchedEpisodes) {
      const coordinates = anime ? episode.canonical : episode;
      if (coordinates == null) continue;
      const key = `${coordinates.season}-${coordinates.number}`;
      const previous = episodes.get(key);
      if (previous == null || (episode.watchedAt ?? '') > (previous.watchedAt ?? '')) {
        episodes.set(key, { ...coordinates, watchedAt: episode.watchedAt });
      }
    }
    if (entry.status !== 'completed' || entry.watchedEpisodes.length !== 0) continue;
    if (anime) {
      for (const season of entry.mappedSeasons ?? []) completedSeasons.add(season);
    } else {
      completedAll = true;
    }
  }
  // Two cours can occupy the same canonical season. One incomplete cour
  // invalidates a sibling's season-wide inference, but not explicit watches.
  for (const entry of entries) {
    if (entry.status === 'completed') continue;
    for (const season of entry.mappedSeasons ?? []) completedSeasons.delete(season);
  }
  return {
    watchedEpisodes: [...episodes.values()],
    watchedKeys: new Set(episodes.keys()),
    completedSeasons,
    completedAll,
  };
}

/** Shared by the episode log button and season accordion, including air-time gating. */
export function simklEpisodeIsWatched(
  state: SimklEpisodeState | null | undefined,
  season: number,
  number: number,
  firstAired: string | undefined,
): boolean {
  return state != null && (
    state.watchedKeys.has(`${season}-${number}`) ||
    ((state.completedAll || state.completedSeasons.has(season)) && hasAired(firstAired))
  );
}
