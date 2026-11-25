import type { NormalizedMediaItem, NormalizedRating } from '@/types/media';

/** One score per source, `first`'s where both carry one. */
function mergeRatings(
  first: NormalizedRating[] | undefined,
  second: NormalizedRating[] | undefined,
): Pick<NormalizedMediaItem, 'ratings'> {
  const ratings = [
    ...(first ?? []),
    ...(second ?? []).filter((rating) => !first?.some(({ source }) => source === rating.source)),
  ];
  return ratings.length > 0 ? { ratings } : {};
}

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
    ...(item.releaseCalendar == null && catalogue.releaseCalendar != null
      ? { releaseCalendar: catalogue.releaseCalendar }
      : {}),
    ...(item.runtime == null && catalogue.runtime != null
      ? { runtime: catalogue.runtime }
      : {}),
    ...(item.genres == null && catalogue.genres != null
      ? { genres: catalogue.genres }
      : {}),
    ...mergeRatings(item.ratings, catalogue.ratings),
    externalIds: { ...catalogue.externalIds, ...item.externalIds },
  };
}

/**
 * Prefer TMDB display metadata while keeping provider progress and identity. Fill missing art
 * so the opened card keeps its poster. AniList cours only take missing art and external ids
 * from whole-series records.
 */
export function applyPrimaryMetadata(
  item: NormalizedMediaItem,
  primary: NormalizedMediaItem | null | undefined,
): NormalizedMediaItem {
  if (primary == null) return item;

  // AniList's TV entries are individual cours; TMDB's match is the entire
  // series. Its year, dates, synopsis and episode count do not describe this
  // entry, but its identity and missing artwork still help the detail page.
  // A single-episode entry that TMDB files as a movie logs as a film, so its
  // TMDB movie id never reaches a show write.
  const isFilm = item.type === 'ANIME' && (item.isFilm === true || primary.type === 'MOVIE');
  const isAnimeCour = item.type === 'ANIME' && !isFilm;

  const hasBackdrop = item.backdropImage != null && item.backdropImage !== '';
  const primaryBackdrop =
    primary.backdropImage != null && primary.backdropImage !== ''
      ? primary.backdropImage
      : null;

  return {
    ...item,
    ...(isFilm ? { isFilm: true } : {}),
    coverImage: item.coverImage !== '' ? item.coverImage : primary.coverImage,
    ...(!hasBackdrop && primaryBackdrop != null
      ? { backdropImage: primaryBackdrop }
      : {}),
    ...(!isAnimeCour && primary.overview != null ? { overview: primary.overview } : {}),
    ...(!isAnimeCour && primary.genres != null && primary.genres.length > 0
      ? { genres: primary.genres }
      : {}),
    ...(!isAnimeCour ? mergeRatings(primary.ratings, item.ratings) : {}),
    ...(!isAnimeCour && primary.runtime != null ? { runtime: primary.runtime } : {}),
    ...(!isAnimeCour && primary.year != null ? { year: primary.year } : {}),
    // Per-key, item winning: AniList's native title is the canonical one for
    // anime, and TMDB's English/original names fill what the provider lacks.
    ...(!isAnimeCour && (primary.titles != null || item.titles != null)
      ? { titles: { ...primary.titles, ...item.titles } }
      : {}),
    // Catalogue metadata, not user state — TMDB wins, same as year/runtime.
    // Load-bearing beyond display: the log button refuses an unreleased film.
    ...(!isAnimeCour && primary.releaseDate != null ? { releaseDate: primary.releaseDate } : {}),
    // Whole-object override, not a per-kind merge: the calendar always arrives
    // from one TMDB read, so a provider-sourced half and a TMDB-sourced half
    // could only disagree, never combine.
    ...(!isAnimeCour && primary.releaseCalendar != null
      ? { releaseCalendar: primary.releaseCalendar }
      : {}),
    ...(!isAnimeCour && item.totalEpisodes == null && primary.totalEpisodes != null
      ? { totalEpisodes: primary.totalEpisodes }
      : {}),
    externalIds: { ...primary.externalIds, ...item.externalIds },
  };
}
