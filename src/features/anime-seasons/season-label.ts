import type { AniZipEpisodeMap } from '@/lib/providers/mapping/anizip';

/**
 * The accordion header's season label (plan 0027 R8), pure so the fallback
 * behavior is testable without rendering.
 *
 * An AniList entry knows only that it has episodes 1..n — "Season 1" was a
 * synthesized claim, and a wrong one for every sequel or split-cour entry. When
 * ani.zip's table agrees on a single canonical season, show that; otherwise
 * return `null` and let the caller keep its neutral label. Never "Season 1" by
 * default: a guess that happens to be right for first seasons is still the
 * habit this plan removes.
 *
 * Display only. Log payloads and watched-checkmark keys stay entry-relative
 * whatever this returns.
 */
export function canonicalSeasonTitle(
  map: AniZipEpisodeMap | null | undefined,
): string | null {
  if (map == null || map.size === 0) return null;
  const seasons = new Set([...map.values()].map((episode) => episode.season));
  if (seasons.size !== 1) return null;
  const [season] = [...seasons];
  return `Season ${season}`;
}
