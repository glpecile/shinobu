import { episodeCode } from '@/features/episode-details/episode-label';
import { hasStartedAiring } from '@/features/log-media/release-gate';
import { Provider } from '@/lib/providers/types';
import { hasAired } from '@/lib/time/has-aired';
import type { SeasonLayout } from '@/lib/providers/mapping/season-layout';
import type { SimklLibraryEntry } from '@/lib/providers/simkl/normalize';
import type { TraktShowProgressResult } from '@/lib/providers/trakt/normalize';
import type { UpNextEpisode, UpNextEpisodeEntry } from '@/features/up-next/types';
import type { NormalizedEpisode, NormalizedMediaItem } from '@/types/media';

export type CatchUpEpisode = Pick<UpNextEpisode, 'season' | 'number' | 'title'>;

export interface CatchUpEvidence {
  trakt?: TraktShowProgressResult | null;
  simkl?: Pick<SimklLibraryEntry, 'watchedKeys' | 'notAiredEpisodes'> | null;
  layout?: SeasonLayout | null;
}

const MAX_CHAIN = 200;

const key = (episode: { season: number; number: number }) =>
  `${episode.season}-${episode.number}`;

export function airedAnimeEpisodes(
  item: NormalizedMediaItem,
  episodes: readonly NormalizedEpisode[],
  airedCount: number | null,
): readonly NormalizedEpisode[] {
  const scheduled = episodes.filter((episode) => episode.firstAired != null);
  const knownAired = Math.max(0, ...scheduled.filter((episode) => hasAired(episode.firstAired)).map((episode) => episode.number));
  return episodes.filter((episode) => episode.firstAired != null
    ? hasAired(episode.firstAired)
    : airedCount != null
      ? episode.number <= airedCount
      : scheduled.length > 0
        ? episode.number <= knownAired
        : hasStartedAiring(item, episodes));
}

export function catalogueCatchUpQueue(
  first: CatchUpEpisode,
  candidates: readonly CatchUpEpisode[],
): CatchUpEpisode[] {
  return [first, ...candidates.filter((episode) =>
    first.season == null
      ? episode.season == null && episode.number > first.number
      : first.season > 0 && episode.season != null &&
        (episode.season > first.season ||
          (episode.season === first.season && episode.number > first.number)),
  ).sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || a.number - b.number)]
    .slice(0, MAX_CHAIN);
}

export function catchUpQueue(
  entry: UpNextEpisodeEntry,
  evidence: CatchUpEvidence,
): CatchUpEpisode[] {
  const { season, number, title } = entry.episode;
  const first: CatchUpEpisode = {
    ...(season != null ? { season } : {}),
    number,
    ...(title != null ? { title } : {}),
  };

  if (entry.source === Provider.Trakt && evidence.trakt?.airedEpisodes != null) {
    return fromTraktProgress(first, evidence.trakt);
  }

  const behind = entry.episodesBehind ?? 1;
  if (behind <= 1) return [first];

  const watched = evidence.simkl?.watchedKeys ?? new Set<string>();
  const airedCount = simklAiredCount(entry, evidence.simkl);

  if (first.season == null) {
    return absoluteWalk(first, behind, watched, airedCount);
  }
  return layoutWalk(first, behind, evidence.layout, watched, airedCount);
}

function fromTraktProgress(
  first: CatchUpEpisode,
  progress: TraktShowProgressResult,
): CatchUpEpisode[] {
  const aired = progress.airedEpisodes ?? [];
  const start = aired.findIndex(
    (episode) => episode.season === first.season && episode.number === first.number,
  );
  if (start < 0) return [first];
  const queue: CatchUpEpisode[] = [first];
  for (const episode of aired.slice(start + 1)) {
    if (queue.length >= MAX_CHAIN) break;
    if (episode.season === 0) continue;
    if (progress.watchedKeys.has(key(episode))) continue;
    queue.push({ season: episode.season, number: episode.number });
  }
  return queue;
}

function simklAiredCount(
  entry: UpNextEpisodeEntry,
  simkl: CatchUpEvidence[typeof Provider.Simkl],
): number | null {
  if (entry.source !== Provider.Simkl || simkl == null) return null;
  const total = entry.item.totalEpisodes;
  const notAired = simkl.notAiredEpisodes;
  if (total == null || notAired == null) return null;
  return total - notAired;
}

function absoluteWalk(
  first: CatchUpEpisode,
  behind: number,
  watched: ReadonlySet<string>,
  airedCount: number | null,
): CatchUpEpisode[] {
  const queue: CatchUpEpisode[] = [first];
  let number = first.number;
  let steps = 0;
  while (queue.length < behind && queue.length < MAX_CHAIN && steps < MAX_CHAIN) {
    number += 1;
    steps += 1;
    if (airedCount != null && number > airedCount) break;
    // Simkl files anime under season 1 (AniDB convention).
    if (watched.has(key({ season: 1, number }))) continue;
    queue.push({ number });
  }
  return queue;
}

function layoutWalk(
  first: CatchUpEpisode & { season?: number },
  behind: number,
  layout: SeasonLayout | null | undefined,
  watched: ReadonlySet<string>,
  airedCount: number | null,
): CatchUpEpisode[] {
  const seasons = (layout ?? [])
    .filter((slot) => slot.season >= 1 && slot.episodeCount > 0)
    .sort((a, b) => a.season - b.season);
  let slot = seasons.findIndex((candidate) => candidate.season === first.season);
  if (slot < 0) return [first];

  const queue: CatchUpEpisode[] = [first];
  let number = first.number;
  let absolute =
    seasons.slice(0, slot).reduce((sum, s) => sum + s.episodeCount, 0) + number;
  let steps = 0;
  while (queue.length < behind && queue.length < MAX_CHAIN && steps < MAX_CHAIN) {
    steps += 1;
    if (number >= seasons[slot].episodeCount) {
      slot += 1;
      if (slot >= seasons.length) break;
      number = 1;
    } else {
      number += 1;
    }
    absolute += 1;
    if (airedCount != null && absolute > airedCount) break;
    const episode = { season: seasons[slot].season, number };
    if (watched.has(key(episode))) continue;
    queue.push(episode);
  }
  return queue;
}

export function catchUpEpisodeCode(episode: CatchUpEpisode): string {
  return episode.season == null
    ? `episode ${episode.number}`
    : episodeCode(episode.season, episode.number);
}
