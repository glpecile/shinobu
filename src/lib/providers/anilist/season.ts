/** AniList's four cours — the `MediaSeason` enum values its API accepts. */
export type AnimeSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

/**
 * A cour, or `YEAR` for the whole year — the explorer's fifth option and the
 * films row's scope (films don't follow cours). `YEAR` never reaches AniList:
 * the read sends no `season` argument for it.
 */
export type AnimeSeasonScope = AnimeSeason | 'YEAR';

export interface AnimeSeasonWindow {
  season: AnimeSeasonScope;
  year: number;
}

/**
 * The anime season a given instant falls in, by AniList's quarter boundaries
 * (WINTER Jan–Mar, SPRING Apr–Jun, SUMMER Jul–Sep, FALL Oct–Dec), evaluated
 * in the user's local timezone — "what season is it now" is a coarse,
 * user-facing question, not an airing-instant comparison (that stays in
 * lib/time/has-aired.ts).
 */
export function animeSeasonAt(date: Date): AnimeSeasonWindow {
  const month = date.getMonth();
  const season: AnimeSeason =
    month <= 2 ? 'WINTER' : month <= 5 ? 'SPRING' : month <= 8 ? 'SUMMER' : 'FALL';
  return { season, year: date.getFullYear() };
}

/** "Summer 2026" — display form of a season window; a whole year is just "2026". */
export function animeSeasonLabel({ season, year }: AnimeSeasonWindow): string {
  if (season === 'YEAR') return String(year);
  const name = season.charAt(0) + season.slice(1).toLowerCase();
  return `${name} ${year}`;
}

/** Display order — the cours as they fall in a calendar year. */
export const ANIME_SEASONS: readonly AnimeSeason[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

/**
 * The year range the seasons explorer lets the user step through. AniList's
 * catalogue thins out fast before the 1960s, and one year past the current
 * one covers everything already announced.
 */
export const MIN_ANIME_YEAR = 1960;
export function maxAnimeYear(now: Date): number {
  return now.getFullYear() + 1;
}

/**
 * A season window out of route params (`?season=SUMMER&year=2026`). Anything
 * missing or malformed falls back field-by-field, so a shared link with a typo
 * still opens *a* season instead of a blank screen.
 */
export function parseAnimeSeasonWindow(
  params: { season?: string; year?: string },
  fallback: AnimeSeasonWindow,
): AnimeSeasonWindow {
  const season =
    params.season === 'YEAR'
      ? 'YEAR'
      : ANIME_SEASONS.find((candidate) => candidate === params.season);
  const year = Number(params.year);
  return {
    season: season ?? fallback.season,
    year: Number.isInteger(year) && year >= MIN_ANIME_YEAR ? year : fallback.year,
  };
}

/**
 * The explorer's format narrowing, mapped to AniList's `format` /
 * `format_not` arguments. `TV` is everything but films — the home row's shape,
 * so the explorer opened from the row shares its cache entry.
 */
export type AnimeFormatFilter = 'ALL' | 'TV' | 'MOVIE';
export const ANIME_FORMAT_FILTERS: readonly AnimeFormatFilter[] = ['ALL', 'TV', 'MOVIE'];

export function parseAnimeFormatFilter(param: string | undefined): AnimeFormatFilter {
  return ANIME_FORMAT_FILTERS.find((candidate) => candidate === param) ?? 'ALL';
}
