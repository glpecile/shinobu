import type { NormalizedMediaItem } from '@/types/media';

export type MediaSort = 'default' | 'title-asc' | 'title-desc' | 'year-desc' | 'year-asc';

/** Valid raw metadata, also used when backfilling a merged provider copy. */
export function mediaSortValue(item: NormalizedMediaItem, field: 'runtime' | 'year'): number | undefined {
  if (field === 'runtime' && item.type === 'MANGA') return undefined;
  const value = item[field];
  return value != null && Number.isFinite(value) && value > 0 &&
    (field !== 'year' || Number.isInteger(value)) ? value : undefined;
}

/** Full film duration or estimated full-series duration over the known count. */
export function mediaRuntimeMinutes(item: NormalizedMediaItem): number | undefined {
  const value = mediaSortValue(item, 'runtime');
  if (value == null || item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true)) return value;
  const episodes = item.totalEpisodes;
  if (episodes == null || !Number.isInteger(episodes) || episodes <= 0) return undefined;
  // Full known episode count, never remaining episodes or watched progress.
  const total = value * episodes;
  return Number.isFinite(total) ? total : undefined;
}

/** Sort only the supplied entries, without mutating provider/query arrays. */
export function sortMediaEntries<T extends { id: string; item: NormalizedMediaItem }>(
  entries: readonly T[],
  sort: MediaSort,
): T[] {
  const sorted = [...entries];
  if (sort === 'default') return sorted;
  const direction = sort.endsWith('asc') ? 1 : -1;
  return sorted.sort((a, b) => {
    const titleOrder = a.item.title.localeCompare(b.item.title, undefined, { numeric: true, sensitivity: 'base' });
    if (sort === 'title-asc' || sort === 'title-desc') return titleOrder * direction || a.id.localeCompare(b.id);
    const av = mediaSortValue(a.item, 'year');
    const bv = mediaSortValue(b.item, 'year');
    if (av == null && bv != null) return 1;
    if (bv == null && av != null) return -1;
    const difference = av != null && bv != null ? (av - bv) * direction : 0;
    return difference || titleOrder || a.id.localeCompare(b.id);
  });
}
