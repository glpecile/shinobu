import { episodeCode } from '@/features/episode-details/episode-label';
import { hasAired } from '@/lib/time/has-aired';
import { localDayOffset } from '@/lib/time/relative-day';
import type { SimklLibraryEntry } from '@/lib/providers/simkl/normalize';
import type { TraktShowProgressResult } from '@/lib/providers/trakt/normalize';
import type { NormalizedSeason } from '@/types/media';

export interface SeriesNextEpisode {
  season: number;
  number: number;
  title?: string;
  aired: boolean;
  firstAired?: string;
  rewatch: boolean;
  unaired: boolean;
}

const FIRST_EPISODE = { season: 1, number: 1 } as const;

const REWATCH_WRAP: SeriesNextEpisode = {
  ...FIRST_EPISODE,
  aired: true,
  rewatch: true,
  unaired: false,
};

const UNAIRED: SeriesNextEpisode = {
  ...FIRST_EPISODE,
  aired: false,
  rewatch: false,
  unaired: true,
};

export function nextEpisodeFromProgress(progress: TraktShowProgressResult): SeriesNextEpisode {
  const next = progress.nextEpisode;
  // Trakt sends next_episode: null for both announced (aired === 0) and finished (aired > 0) shows.
  if (next == null) return progress.aired === 0 ? UNAIRED : REWATCH_WRAP;

  return {
    season: next.season,
    number: next.number,
    ...(next.title != null ? { title: next.title } : {}),
    aired: next.firstAired == null ? true : hasAired(next.firstAired),
    ...(next.firstAired != null ? { firstAired: next.firstAired } : {}),
    rewatch: false,
    unaired: false,
  };
}

/**
 * Simkl omits `next_to_watch` outside `watching` and omits `season` on
 * absolute-numbered anime pointers; returns `null` when next episode cannot be named.
 */
export function nextEpisodeFromSimklEntry(
  item: {
    currentProgress: number;
    totalEpisodes: number | null | undefined;
    releaseDate?: string | null;
  },
  entry: Pick<SimklLibraryEntry, 'nextToWatch' | 'notAiredEpisodes'> | null,
): SeriesNextEpisode | null {
  if (entry != null) {
    const next = entry.nextToWatch;
    if (next == null) {
      const aired = simklAiredCount(item, entry);
      if (aired === 0) return UNAIRED;
      if (aired != null && item.currentProgress < aired) return null;
      return REWATCH_WRAP;
    }
    if (next.season == null) return null;
    return {
      season: next.season,
      number: next.episode,
      ...(next.title != null ? { title: next.title } : {}),
      aired: next.date == null ? true : hasAired(next.date),
      ...(next.date != null ? { firstAired: next.date } : {}),
      rewatch: false,
      unaired: false,
    };
  }
  if (item.currentProgress === 0) {
    const premiere = item.releaseDate;
    return {
      ...FIRST_EPISODE,
      aired: premiere == null ? true : hasAired(premiere),
      ...(premiere != null ? { firstAired: premiere } : {}),
      rewatch: false,
      unaired: false,
    };
  }
  if (item.totalEpisodes != null && item.currentProgress >= item.totalEpisodes) {
    return REWATCH_WRAP;
  }
  return null;
}

function simklAiredCount(
  item: { totalEpisodes: number | null | undefined },
  entry: Pick<SimklLibraryEntry, 'notAiredEpisodes'>,
): number | null {
  const { totalEpisodes } = item;
  const notAired = entry.notAiredEpisodes;
  if (totalEpisodes == null || notAired == null) return null;
  return totalEpisodes - notAired;
}

export function simklAnimeEpisodeAired(
  number: number,
  item: { currentProgress: number; totalEpisodes: number | null | undefined },
  entry: Pick<SimklLibraryEntry, 'nextToWatch' | 'notAiredEpisodes'>,
  now: Date = new Date(),
): boolean {
  if (number <= item.currentProgress) return true;
  const aired = simklAiredCount(item, entry);
  if (aired != null) return number <= aired;
  const next = entry.nextToWatch;
  return next?.episode === number && (next.date == null || hasAired(next.date, now));
}

export function seriesEpisodeLabel(episode: { season: number; number: number }): string {
  return episodeCode(episode.season, episode.number);
}

/** First unaired non-special episode; trackers report the same absent pointer for caught-up and finished shows (docs/solutions/trackers-cant-tell-caught-up-from-finished.md). */
export function firstUnairedEpisode(
  seasons: readonly NormalizedSeason[] | undefined,
  now: Date = new Date(),
): { season: number; number: number; firstAired?: string } | null {
  for (const season of seasons ?? []) {
    if (season.number === 0) continue;
    for (const episode of season.episodes) {
      if (hasAired(episode.firstAired, now)) continue;
      return {
        season: season.number,
        number: episode.number,
        ...(episode.firstAired != null ? { firstAired: episode.firstAired } : {}),
      };
    }
  }
  return null;
}

export function unairedEpisodeLabel(
  label: string,
  firstAired: string | null | undefined,
  now: Date = new Date(),
): string {
  const offset = localDayOffset(firstAired, now);
  if (offset == null || offset < 0) return `${label} hasn’t aired yet`;
  if (offset > 1) return `${label} airs in ${offset} days`;
  return `${label} airs ${offset === 0 ? 'today' : 'tomorrow'}`;
}
