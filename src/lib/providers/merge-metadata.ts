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
    ...(item.releaseDate == null && catalogue.releaseDate != null
      ? { releaseDate: catalogue.releaseDate }
      : {}),
    ...(item.homeReleaseDate == null && catalogue.homeReleaseDate != null
      ? {
          homeReleaseDate: catalogue.homeReleaseDate,
          ...(catalogue.homeReleaseKind != null
            ? { homeReleaseKind: catalogue.homeReleaseKind }
            : {}),
        }
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

/**
 * The TMDB-first inverse of `mergeCatalogueMetadata` (plan 0014): `primary`
 * (the TMDB catalogue record) WINS for pure *text* display fields when it has
 * them — overview, genres, rating, runtime, year, release dates — because TMDB
 * is the source of truth for metadata. Fill-only for `totalEpisodes` (provider
 * totals drive the progress UI and must agree with `currentProgress`), and
 * identity/user state (id, type, progress, lastUpdated) plus external-id
 * precedence stay exactly as in `mergeCatalogueMetadata`. A null primary is
 * the failover case: the item passes through untouched.
 *
 * **Artwork is the deliberate exception — fill-only, never an override**
 * (owner decision, 2026-07-27). Posters and backdrops are the one field the
 * viewer has already *seen* before this merge runs: they tapped a card whose
 * poster was painted from the feed/search item, and the details screen renders
 * that same poster instantly, then TMDB answers a beat later. Overriding it
 * swapped the hero and the poster under the viewer mid-read for no gain — the
 * provider art is already correct, only different. So TMDB art now lands only
 * where the item carries none (a Trakt watched row, a Letterboxd slug), which
 * is the case it was actually valuable for.
 */
export function applyPrimaryMetadata(
  item: NormalizedMediaItem,
  primary: NormalizedMediaItem | null | undefined,
): NormalizedMediaItem {
  if (primary == null) return item;

  const hasBackdrop = item.backdropImage != null && item.backdropImage !== '';
  const primaryBackdrop =
    primary.backdropImage != null && primary.backdropImage !== ''
      ? primary.backdropImage
      : null;

  return {
    ...item,
    coverImage: item.coverImage !== '' ? item.coverImage : primary.coverImage,
    ...(!hasBackdrop && primaryBackdrop != null
      ? { backdropImage: primaryBackdrop }
      : {}),
    ...(primary.overview != null ? { overview: primary.overview } : {}),
    ...(primary.genres != null && primary.genres.length > 0
      ? { genres: primary.genres }
      : {}),
    ...(primary.rating != null ? { rating: primary.rating } : {}),
    ...(primary.runtime != null ? { runtime: primary.runtime } : {}),
    ...(primary.year != null ? { year: primary.year } : {}),
    // Catalogue metadata, not user state — TMDB wins, same as year/runtime.
    // Load-bearing beyond display: the log button refuses an unreleased film.
    ...(primary.releaseDate != null ? { releaseDate: primary.releaseDate } : {}),
    ...(primary.homeReleaseDate != null
      ? {
          homeReleaseDate: primary.homeReleaseDate,
          ...(primary.homeReleaseKind != null
            ? { homeReleaseKind: primary.homeReleaseKind }
            : {}),
        }
      : {}),
    ...(item.totalEpisodes == null && primary.totalEpisodes != null
      ? { totalEpisodes: primary.totalEpisodes }
      : {}),
    externalIds: { ...primary.externalIds, ...item.externalIds },
  };
}
