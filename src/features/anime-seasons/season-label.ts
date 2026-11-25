import type { AniZipEpisodeMap } from '@/lib/providers/mapping/anizip';

export function canonicalSeasonTitle(
  map: AniZipEpisodeMap | null | undefined,
): string | null {
  if (map == null || map.size === 0) return null;
  const seasons = new Set([...map.values()].map((episode) => episode.season));
  if (seasons.size !== 1) return null;
  const [season] = [...seasons];
  return `Season ${season}`;
}
