import type { NormalizedMediaItem } from '@/types/media';

export interface DetailVariant {
  source: 'tmdb' | 'anilist' | 'simkl' | 'letterboxd';
  /** A `/details/[id]` id. */
  id: string;
}

/**
 * The item's other details pages. TMDB, AniList and Simkl ids all resolve
 * cold (`useResolvedMediaItem`); a Letterboxd slug is only ever known from the
 * user's own cached Letterboxd rows, so the caller supplies it or it isn't
 * offered. Letterboxd has film pages only.
 */
export function detailVariants(
  item: Pick<NormalizedMediaItem, 'id' | 'type' | 'isFilm' | 'externalIds'>,
): DetailVariant[] {
  const { tmdb, anilist, simkl, letterboxd } = item.externalIds;
  const movie = item.type === 'MOVIE' || item.isFilm === true;
  const variants: DetailVariant[] = [];
  if (tmdb != null && item.type !== 'MANGA') {
    variants.push({ source: 'tmdb', id: `tmdb-${movie ? 'movie' : 'tv'}-${tmdb}` });
  }
  if (anilist != null) variants.push({ source: 'anilist', id: `anilist-${anilist}` });
  if (simkl != null && item.type !== 'MANGA') variants.push({ source: 'simkl', id: `simkl-${simkl}` });
  if (letterboxd != null && movie) variants.push({ source: 'letterboxd', id: `letterboxd-${letterboxd}` });
  return variants.filter((variant) => variant.id !== item.id);
}
