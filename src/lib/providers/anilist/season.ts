/** AniList's four cours — the `MediaSeason` enum values its API accepts. */
export type AnimeSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export interface AnimeSeasonWindow {
  season: AnimeSeason;
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

/** "Summer 2026" — display form of a season window. */
export function animeSeasonLabel({ season, year }: AnimeSeasonWindow): string {
  const name = season.charAt(0) + season.slice(1).toLowerCase();
  return `${name} ${year}`;
}
