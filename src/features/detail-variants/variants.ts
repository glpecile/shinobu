import type { NormalizedMediaItem } from '@/types/media';

export interface DetailVariant {
  source: 'tmdb' | 'anilist';
  /** A `/details/[id]` id. */
  id: string;
}

/**
 * The item's other details pages. Only TMDB and AniList ids: they're the ones
 * a cold `/details/[id]` resolves (`useResolvedMediaItem`), where a tracker id
 * needs the item already cached.
 */
export function detailVariants(
  item: Pick<NormalizedMediaItem, 'id' | 'type' | 'isFilm' | 'externalIds'>,
): DetailVariant[] {
  const { tmdb, anilist } = item.externalIds;
  const kind = item.type === 'MOVIE' || item.isFilm === true ? 'movie' : 'tv';
  const variants: DetailVariant[] = [];
  if (tmdb != null && item.type !== 'MANGA') variants.push({ source: 'tmdb', id: `tmdb-${kind}-${tmdb}` });
  if (anilist != null) variants.push({ source: 'anilist', id: `anilist-${anilist}` });
  return variants.filter((variant) => variant.id !== item.id);
}
