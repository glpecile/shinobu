import type { AniListLibraryEntry } from '@/lib/providers/anilist/library';
import { titleKey } from '@/lib/providers/pick-movie-match';
import type { NormalizedMediaItem } from '@/types/media';

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
  return ['tmdb', 'trakt', 'anilist', 'simkl', 'mal', 'letterboxd'].some((key) => {
    const id = key as keyof NormalizedMediaItem['externalIds'];
    return item.externalIds[id] != null && item.externalIds[id] === candidate.externalIds[id];
  });
}

/** Exact identities first; a unique film title/alias and year can bridge an AniList library entry. */
export function findAniListProgress(item: NormalizedMediaItem, library: readonly AniListLibraryEntry[]) {
  const exact = library.find((entry) => sameProgressItem(item, entry.item));
  if (exact != null) return exact;
  if (!(item.type === 'MOVIE' || item.isFilm === true) || item.year == null) return undefined;
  const wanted = titleKey(item.title);
  const candidates = library.filter(({ item: anime }) => anime.isFilm === true && anime.year === item.year &&
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
