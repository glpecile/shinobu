import type { AniZipCanonicalEpisode } from './anizip';

/**
 * How the *destination* tracker carves a show into seasons — the arbiter plan
 * 0027 originally didn't have.
 *
 * ani.zip's `seasonNumber` is TVDB-derived, and TVDB splits anime into
 * broadcast seasons that Trakt and TMDB largely don't have: "The 100
 * Girlfriends … Season 3" is TVDB S3E4 but a single 28-episode season on both
 * trackers, so writing S03E04 404s on Trakt and can't resolve a Serializd
 * season id. Live probes (six entries, both trackers) are recorded in
 * `docs/solutions/anizip-tvdb-seasons-vs-tracker-seasons.md`; the headline is
 * that **Trakt and TMDB agree with each other** on every one, so a single
 * layout resolves both providers and translation stays one centralized step.
 */
export interface SeasonSlot {
  season: number;
  /** Episodes the season is structured to hold — including not-yet-aired ones. */
  episodeCount: number;
}

export type SeasonLayout = readonly SeasonSlot[];

/** Season 0 is specials — never a target, and never part of absolute counting. */
function regularSeasons(layout: SeasonLayout): SeasonSlot[] {
  return layout
    .filter((slot) => slot.season >= 1 && slot.episodeCount > 0)
    .sort((a, b) => a.season - b.season);
}

/**
 * Place one ani.zip row in the destination's own numbering, or return `null`
 * when it can't be placed — which becomes a reasoned skip, never a guess.
 *
 * Order matters. The TVDB pair wins **when the destination actually has that
 * season with room for the episode**, because where a tracker does split by
 * season it splits the same way TVDB does (Mushoku Tensei S2 part 2 → S02E13,
 * where counting absolutely would land on S02E15 instead — TVDB's absolute
 * numbering and TMDB's per-season counts don't line up). Only when that season
 * is missing or too short does the absolute number take over, which is the
 * single-continuous-season case that covers most sequel entries.
 */
export function placeInLayout(
  layout: SeasonLayout | null | undefined,
  episode: AniZipCanonicalEpisode,
): { season: number; number: number } | null {
  if (layout == null) return null;
  const seasons = regularSeasons(layout);
  if (seasons.length === 0) return null;

  const named = seasons.find((slot) => slot.season === episode.season);
  if (named != null && named.episodeCount >= episode.number) {
    return { season: episode.season, number: episode.number };
  }

  const absolute = episode.absolute;
  if (absolute == null) return null;

  let consumed = 0;
  for (const slot of seasons) {
    if (absolute <= consumed + slot.episodeCount) {
      return { season: slot.season, number: absolute - consumed };
    }
    consumed += slot.episodeCount;
  }
  return null;
}
