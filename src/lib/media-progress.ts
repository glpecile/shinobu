import type { AniListLibraryEntry } from '@/lib/providers/anilist/library';
import { titleKey } from '@/lib/providers/pick-movie-match';
import type { NormalizedMediaItem } from '@/types/media';

// oxlint-disable-next-line shinobu/no-provider-literals -- externalIds keys, not provider ids.
const ID_KEYS = ['tmdb', 'trakt', 'anilist', 'simkl', 'mal', 'letterboxd'] as const;
type IdKey = (typeof ID_KEYS)[number];

export interface MediaProgress {
  watched: boolean;
  completed: boolean;
  current: number;
  total?: number;
  unit: NormalizedMediaItem['progressUnit'] | 'season';
}

/** Movie/TV numbers occupy different namespaces; anime cours match only exact entry IDs. */
export function sameProgressItem(item: NormalizedMediaItem, candidate: NormalizedMediaItem): boolean {
  const film = item.type === 'MOVIE' || item.isFilm === true;
  const candidateFilm = candidate.type === 'MOVIE' || candidate.isFilm === true;
  if (film !== candidateFilm || (item.type === 'MANGA') !== (candidate.type === 'MANGA')) return false;
  if (item.type === 'ANIME' && !film) {
    return (item.externalIds.anilist != null && item.externalIds.anilist === candidate.externalIds.anilist) ||
      (item.externalIds.simkl != null && item.externalIds.simkl === candidate.externalIds.simkl);
  }
  return ID_KEYS.some((key) => item.externalIds[key] != null && item.externalIds[key] === candidate.externalIds[key]);
}

/** One value per row, sorted, with equal values kept in list order. */
interface Column {
  values: (number | string)[];
  rows: Int32Array;
}

/**
 * A library sorted once by each external id and by year, so a lookup
 * binary-searches one run of equal values instead of scanning every row. Build
 * it when the snapshot changes, not per item or per render.
 */
export interface LibraryIndex<T> {
  rows: readonly T[];
  itemOf: (row: T) => NormalizedMediaItem;
  columns: Record<IdKey | 'year', Column>;
}

const valueOf = (item: NormalizedMediaItem, key: IdKey | 'year') => key === 'year' ? item.year : item.externalIds[key];

export function indexLibrary<T>(rows: readonly T[], itemOf: (row: T) => NormalizedMediaItem): LibraryIndex<T> {
  const columns = {} as Record<IdKey | 'year', Column>;
  for (const key of [...ID_KEYS, 'year'] as const) {
    const order: number[] = [];
    const values: (number | string)[] = [];
    rows.forEach((row, index) => {
      const value = valueOf(itemOf(row), key);
      if (value == null) return;
      order.push(index);
      values[index] = value;
    });
    order.sort((a, b) => (values[a] < values[b] ? -1 : values[a] > values[b] ? 1 : a - b));
    columns[key] = { values: order.map((index) => values[index]), rows: Int32Array.from(order) };
  }
  return { rows, itemOf, columns };
}

/** Row numbers whose `key` equals `value`, in list order. */
export function rowsWith<T>(index: LibraryIndex<T>, key: IdKey | 'year', value: number | string): Int32Array {
  const { values, rows } = index.columns[key];
  let start = 0;
  let end = values.length;
  while (start < end) {
    const middle = (start + end) >>> 1;
    if (values[middle] < value) start = middle + 1;
    else end = middle;
  }
  end = start;
  while (end < values.length && values[end] === value) end++;
  return rows.subarray(start, end);
}

/** The earliest row sharing one of `keys` with `item` that `accept` takes: what `find` over the rows returns. */
export function firstRow<T>(index: LibraryIndex<T>, item: NormalizedMediaItem, keys: readonly IdKey[], accept: (row: T) => boolean = () => true): T | undefined {
  let first = -1;
  for (const key of keys) {
    const value = item.externalIds[key];
    if (value == null) continue;
    for (const row of rowsWith(index, key, value)) {
      if (first !== -1 && row >= first) break;
      if (accept(index.rows[row])) {
        first = row;
        break;
      }
    }
  }
  return first === -1 ? undefined : index.rows[first];
}

/** The first row whose item is `item` by `sameProgressItem`. */
export function findProgressRow<T>(index: LibraryIndex<T>, item: NormalizedMediaItem): T | undefined {
  return firstRow(index, item, ID_KEYS, (row) => sameProgressItem(item, index.itemOf(row)));
}

/** Exact identities first; a unique film title/alias and year can bridge an AniList library entry. Pass an index when matching many items. */
export function findAniListProgress(item: NormalizedMediaItem, library: readonly AniListLibraryEntry[] | LibraryIndex<AniListLibraryEntry>) {
  const index = 'columns' in library ? library : indexLibrary(library, (entry) => entry.item);
  const exact = findProgressRow(index, item);
  if (exact != null) return exact;
  if (!(item.type === 'MOVIE' || item.isFilm === true) || item.year == null) return undefined;
  const wanted = titleKey(item.title);
  const candidates = [...rowsWith(index, 'year', item.year)].map((row) => index.rows[row]).filter(({ item: anime }) => anime.isFilm === true &&
    [anime.title, ...Object.values(anime.titles ?? {})].some((title) => title != null && titleKey(title) === wanted));
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** Never sum providers' copies of the same progress or treat a started series as completed. */
export function mergeMediaProgress(item: NormalizedMediaItem, sources: readonly MediaProgress[]): MediaProgress {
  const film = item.type === 'MOVIE' || item.isFilm === true;
  const episodeProgress = sources.some((source) => source.unit === item.progressUnit && source.current > 0);
  const unit = !film && !episodeProgress && item.currentProgress === 0 && sources.some((source) => source.unit === 'season') ? 'season' : item.progressUnit;
  const numeric = sources.filter((source) => source.unit === unit);
  const current = Math.max(item.currentProgress, ...numeric.map((source) => source.current));
  const total = (unit === item.progressUnit ? item.totalEpisodes : undefined) ?? numeric.find((source) => source.total != null && source.total > 0)?.total;
  const watched = sources.some((source) => source.watched) || current > 0;
  const completed = sources.some((source) => source.completed) ||
    (!film && total != null && total > 0 && current >= total);
  return { watched, completed: film ? watched : completed, current: film ? Number(watched) : current, total: film ? 1 : total, unit };
}
