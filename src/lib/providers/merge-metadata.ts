import type { NormalizedMediaItem } from '@/types/media';

/**
 * Fill an item's missing display metadata from a catalogue record of the same
 * film — how a Letterboxd item (slug + title + year only) comes to render a
 * details page as rich as a Trakt/AniList one. The item's identity and user
 * state (id, title, type, progress, its own external ids) always win; the
 * catalogue only supplies what's absent. Merged external ids also light up
 * the id-keyed detail sections (cast, studios, watched state).
 */
export function mergeCatalogueMetadata(
  item: NormalizedMediaItem,
  catalogue: NormalizedMediaItem,
): NormalizedMediaItem {
  const hasBackdrop = item.backdropImage != null && item.backdropImage !== '';
  const catalogueBackdrop =
    catalogue.backdropImage != null && catalogue.backdropImage !== ''
      ? catalogue.backdropImage
      : null;

  return {
    ...item,
    coverImage: item.coverImage !== '' ? item.coverImage : catalogue.coverImage,
    ...(!hasBackdrop && catalogueBackdrop != null
      ? { backdropImage: catalogueBackdrop }
      : {}),
    ...(item.overview == null && catalogue.overview != null
      ? { overview: catalogue.overview }
      : {}),
    ...(item.year == null && catalogue.year != null
      ? { year: catalogue.year }
      : {}),
    ...(item.runtime == null && catalogue.runtime != null
      ? { runtime: catalogue.runtime }
      : {}),
    ...(item.genres == null && catalogue.genres != null
      ? { genres: catalogue.genres }
      : {}),
    ...(item.rating == null && catalogue.rating != null
      ? { rating: catalogue.rating }
      : {}),
    externalIds: { ...catalogue.externalIds, ...item.externalIds },
  };
}
