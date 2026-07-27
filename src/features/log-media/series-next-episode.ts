import { hasAired } from '@/lib/time/has-aired';
import type { TraktShowProgressResult } from '@/lib/providers/trakt/normalize';

export interface SeriesNextEpisode {
  season: number;
  number: number;
  title?: string;
  /**
   * Timezone-correct (`lib/time/has-aired`). An episode Trakt knows but has no
   * air date for counts as aired — same permissive rule the anime path uses,
   * so a catalogue gap never blocks a legitimate log.
   */
  aired: boolean;
  /**
   * True when this isn't a *next* episode at all — the show is finished and
   * the episode is the wrap back to the start. Callers must say so rather
   * than presenting S1E1 as if it were up next.
   */
  rewatch: boolean;
}

/** A show with nothing left to watch restarts here — see the wrap below. */
const FIRST_EPISODE = { season: 1, number: 1 } as const;

/**
 * Trakt's watched progress → the episode a one-tap log would write. Kept pure
 * (and free of any React Native import, so `bun test` can load it) because the
 * two rules that matter are worth asserting: the completed-show wrap, and the
 * permissive unknown-air-date gate.
 */
export function nextEpisodeFromProgress(
  progress: TraktShowProgressResult,
): SeriesNextEpisode {
  const next = progress.nextEpisode;
  // Trakt sends `next_episode: null` once every aired episode is watched.
  // Wrapping to S1E1 mirrors the anime button (`progress >= total → 1`): a
  // finished show offers a rewatch rather than going dead. Flagged, because
  // a button reading "Log S1E1" on a show you finished is a lie.
  if (next == null) return { ...FIRST_EPISODE, aired: true, rewatch: true };

  return {
    season: next.season,
    number: next.number,
    ...(next.title != null ? { title: next.title } : {}),
    aired: next.firstAired == null ? true : hasAired(next.firstAired),
    rewatch: false,
  };
}

/** Display form of an episode reference — "S2E5". */
export function seriesEpisodeLabel(episode: {
  season: number;
  number: number;
}): string {
  return `S${episode.season}E${episode.number}`;
}
