import type { NormalizedSeason } from '@/types/media';

export interface EpisodeRef {
  season: number;
  number: number;
}

export function episodeOrder(
  seasons: readonly NormalizedSeason[],
  season: number,
): EpisodeRef[] {
  return [...seasons]
    .filter((entry) => (entry.number === 0) === (season === 0))
    .sort((a, b) => a.number - b.number)
    .flatMap((entry) =>
      [...entry.episodes]
        .sort((a, b) => a.number - b.number)
        .map((episode) => ({ season: entry.number, number: episode.number })),
    );
}

export function episodeNeighbours(
  seasons: readonly NormalizedSeason[],
  season: number,
  number: number,
): { prev?: EpisodeRef; next?: EpisodeRef } {
  const ordered = episodeOrder(seasons, season);
  const index = ordered.findIndex(
    (entry) => entry.season === season && entry.number === number,
  );
  if (index === -1) return {};
  const prev = ordered[index - 1];
  const next = ordered[index + 1];
  return {
    ...(prev != null ? { prev } : {}),
    ...(next != null ? { next } : {}),
  };
}
