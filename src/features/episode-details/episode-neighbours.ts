import type { NormalizedSeason } from '@/types/media';

export interface EpisodeRef {
  season: number;
  number: number;
}

/**
 * The episodes either side of `{season, number}` in the show's own layout,
 * crossing season boundaries (S1's last → S2's first). Specials (season 0)
 * are their own sequence: stepping back from S1E1 must not land on one.
 */
export function episodeNeighbours(
  seasons: readonly NormalizedSeason[],
  season: number,
  number: number,
): { prev?: EpisodeRef; next?: EpisodeRef } {
  const ordered = [...seasons]
    .filter((entry) => (entry.number === 0) === (season === 0))
    .sort((a, b) => a.number - b.number)
    .flatMap((entry) =>
      [...entry.episodes]
        .sort((a, b) => a.number - b.number)
        .map((episode) => ({ season: entry.number, number: episode.number })),
    );
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
