import type { AniZipCanonicalEpisode, AniZipEpisodeMap } from './anizip';
import { placeInLayout, type SeasonLayout } from './season-layout';

/**
 * Entry-relative → canonical numbering (plan 0027 KTD3), pure so the bounds are
 * unit-testable without a fetch.
 *
 * The rule this file exists to enforce: **a wrong season is worse than no
 * write** (docs/solutions/trakt-text-search-wrong-movie-match.md). Today's
 * behavior — stamping `season: 1` on every AniList-origin log — *is* the wrong
 * guess; an honest `ok: false` here turns it into a reasoned skip carrying a
 * manual deep link (plan 0022 R6) instead.
 *
 * Resolution is all-or-nothing per batch: `ProviderWriteOutcome` has no
 * per-episode granularity, so a half-mappable batch must not half-write.
 */
export type EpisodeTranslation =
  | { ok: true; episodes: AniZipCanonicalEpisode[] }
  | { ok: false; reason: string };

/**
 * How far past the mapping table's last known episode an extrapolation may
 * reach. Non-zero because ani.zip lags a just-aired episode by hours; small
 * because an unbounded guess re-creates exactly the fabricated-season write
 * this module removes (a whole-entry batch on a half-populated table must not
 * invent a season's back half).
 */
const MAX_EXTRAPOLATION = 2;

interface MappedTable {
  season: number;
  /** True when the table crosses a canonical season boundary — no extrapolating. */
  spansSeasons: boolean;
  /** Highest entry-relative episode the table actually carries. */
  lastEntryNumber: number;
  /** Its canonical episode number — the base every extrapolation counts from. */
  lastCanonicalNumber: number;
  /** And its absolute position, so an extrapolated row can be placed too. */
  lastAbsoluteNumber?: number;
}

/**
 * A gapped table means the entry's episodes and the canonical show's don't
 * correspond 1:1 (recaps, merged double episodes), so even a row that *is*
 * present is suspect and the whole batch stops.
 *
 * A multi-season table only blocks **extrapolation** — there is no honest way
 * to guess past a boundary the dataset didn't describe. Rows the table does
 * carry are fine: they get placed against the destination tracker's own season
 * layout (`placeInLayout`), which is a stronger check than anything the shape
 * of this table could tell us.
 */
function describeTable(map: AniZipEpisodeMap): MappedTable | string {
  const rows = [...map.entries()].sort(([a], [b]) => a - b);
  if (rows.length === 0) return 'ani.zip has no episode mapping for this entry yet';

  const gaps =
    "ani.zip's episode numbering for this entry has gaps — the season can't be resolved safely";
  const season = rows[0][1].season;
  let spansSeasons = false;
  for (let index = 1; index < rows.length; index++) {
    const [entryNumber, canonical] = rows[index];
    const [previousEntry, previousCanonical] = rows[index - 1];
    if (entryNumber !== previousEntry + 1) return gaps;

    // Absolute numbering runs straight through season boundaries, so when both
    // rows carry it, it is the one axis that proves 1:1 correspondence
    // everywhere. Without it, fall back to per-season episode numbers — which
    // legitimately restart at a boundary.
    if (canonical.absolute != null && previousCanonical.absolute != null) {
      if (canonical.absolute !== previousCanonical.absolute + 1) return gaps;
    } else if (
      canonical.season === previousCanonical.season &&
      canonical.number !== previousCanonical.number + 1
    ) {
      return gaps;
    }

    if (canonical.season !== season) spansSeasons = true;
  }

  const [lastEntryNumber, lastCanonical] = rows[rows.length - 1];
  return {
    season,
    spansSeasons,
    lastEntryNumber,
    lastCanonicalNumber: lastCanonical.number,
    ...(lastCanonical.absolute != null
      ? { lastAbsoluteNumber: lastCanonical.absolute }
      : {}),
  };
}

export interface TranslationContext {
  /**
   * How the destination tracker splits this show into seasons. Required: an
   * ani.zip row is TVDB's opinion, and TVDB's seasons are frequently not the
   * trackers' — without this there is nothing to check the row against.
   */
  layout: SeasonLayout | null;
  /**
   * The entry's own AniList episode total when known — an extrapolation past
   * it would invent an episode the entry doesn't have, so it caps the bound
   * independently of `MAX_EXTRAPOLATION`.
   */
  declaredEpisodeCount?: number;
}

/**
 * Translate one batch of AniList-entry-relative episode numbers into the
 * `{season, number}` pairs Trakt and Serializd can actually resolve.
 *
 * Two hops, not one: ani.zip turns an entry episode into a TVDB row, then
 * `placeInLayout` puts that row where the destination tracker keeps it. Skipping
 * the second hop is what wrote S03E04 to a show whose trackers only have one
 * 28-episode season.
 */
export function translateEntryEpisodes(
  map: AniZipEpisodeMap | null,
  entryNumbers: readonly number[],
  context: TranslationContext,
): EpisodeTranslation {
  if (map == null) {
    return { ok: false, reason: 'no ani.zip season mapping for this entry' };
  }
  if (entryNumbers.length === 0) {
    return { ok: false, reason: 'no episodes to map' };
  }
  if (context.layout == null) {
    return {
      ok: false,
      reason: "couldn't read this show's season list to place the episode",
    };
  }

  const table = describeTable(map);
  if (typeof table === 'string') return { ok: false, reason: table };

  const episodes: Array<{ season: number; number: number }> = [];
  for (const entryNumber of entryNumbers) {
    const row = map.get(entryNumber) ?? extrapolate(table, entryNumber, context);
    if (typeof row === 'string') return { ok: false, reason: row };

    const placed = placeInLayout(context.layout, row);
    if (placed == null) {
      return {
        ok: false,
        reason: `this show has no season ${row.season} episode ${row.number} to log against`,
      };
    }
    episodes.push(placed);
  }

  return { ok: true, episodes };
}

/**
 * The just-aired case: ani.zip lags an episode by hours, so a row a short way
 * past the table's end is projected rather than refused. Returns the reason
 * string when the projection isn't safe.
 */
function extrapolate(
  table: MappedTable,
  entryNumber: number,
  context: TranslationContext,
): AniZipCanonicalEpisode | string {
  const gap = entryNumber - table.lastEntryNumber;
  if (gap < 1 || gap > MAX_EXTRAPOLATION) {
    return `ani.zip has no season mapping for episode ${entryNumber} of this entry yet`;
  }
  if (table.spansSeasons) {
    return "this entry's episodes cross a season boundary — Shinobu won't guess past the last mapped one";
  }
  const declared = context.declaredEpisodeCount;
  if (declared != null && entryNumber > declared) {
    return `episode ${entryNumber} is past this entry's ${declared} episodes — no season mapping`;
  }
  return {
    season: table.season,
    number: table.lastCanonicalNumber + gap,
    ...(table.lastAbsoluteNumber != null
      ? { absolute: table.lastAbsoluteNumber + gap }
      : {}),
  };
}
