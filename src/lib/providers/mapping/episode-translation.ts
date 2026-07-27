import type { AniZipCanonicalEpisode, AniZipEpisodeMap } from './anizip';

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
 * Resolution is all-or-nothing per batch: `ProviderLogOutcome` has no
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
  /** Highest entry-relative episode the table actually carries. */
  lastEntryNumber: number;
  /** Its canonical episode number — the base every extrapolation counts from. */
  lastCanonicalNumber: number;
}

/**
 * A table is only trustworthy enough to extrapolate from — or, per KTD3, to
 * read at all — when every episode it carries lands in one canonical season
 * with lockstep-contiguous numbering. A gapped table means the entry's episodes
 * and the canonical show's don't correspond 1:1 (recaps, merged double
 * episodes), so even a row that *is* present is suspect.
 *
 * Multi-season is refused for a second reason: those are the long-runners (One
 * Piece, Detective Conan — one AniList entry against a TVDB show carved into
 * twenty seasons), and a season split is exactly where TVDB and TMDB disagree
 * (KTD6). Serializd is TMDB-keyed, so a "precise" TVDB row there is the least
 * trustworthy thing to write, not the most. Consequence, recorded on purpose:
 * a long-runner logs to AniList and offers manual links for Trakt/Serializd
 * rather than writing a season it can't stand behind.
 */
function describeTable(map: AniZipEpisodeMap): MappedTable | string {
  const rows = [...map.entries()].sort(([a], [b]) => a - b);
  if (rows.length === 0) return 'ani.zip has no episode mapping for this entry yet';

  const season = rows[0][1].season;
  for (let index = 1; index < rows.length; index++) {
    const [entryNumber, canonical] = rows[index];
    const [previousEntry, previousCanonical] = rows[index - 1];
    if (canonical.season !== season) {
      return "this entry's episodes span more than one canonical season — Shinobu won't guess which";
    }
    if (
      entryNumber !== previousEntry + 1 ||
      canonical.number !== previousCanonical.number + 1
    ) {
      return "ani.zip's episode numbering for this entry has gaps — the season can't be resolved safely";
    }
  }

  const [lastEntryNumber, lastCanonical] = rows[rows.length - 1];
  return { season, lastEntryNumber, lastCanonicalNumber: lastCanonical.number };
}

/**
 * Translate one batch of AniList-entry-relative episode numbers into the
 * canonical `{season, number}` pairs Trakt and Serializd expect.
 *
 * `declaredEpisodeCount` is the entry's own AniList episode total when known —
 * an extrapolation past it would be inventing an episode that entry doesn't
 * have, so it caps the bound independently of `MAX_EXTRAPOLATION`.
 */
export function translateEntryEpisodes(
  map: AniZipEpisodeMap | null,
  entryNumbers: readonly number[],
  declaredEpisodeCount?: number,
): EpisodeTranslation {
  if (map == null) {
    return { ok: false, reason: 'no ani.zip season mapping for this entry' };
  }
  if (entryNumbers.length === 0) {
    return { ok: false, reason: 'no episodes to map' };
  }

  const table = describeTable(map);
  if (typeof table === 'string') return { ok: false, reason: table };

  const episodes: AniZipCanonicalEpisode[] = [];
  for (const entryNumber of entryNumbers) {
    const mapped = map.get(entryNumber);
    if (mapped != null) {
      episodes.push(mapped);
      continue;
    }
    const gap = entryNumber - table.lastEntryNumber;
    if (gap < 1 || gap > MAX_EXTRAPOLATION) {
      return {
        ok: false,
        reason: `ani.zip has no season mapping for episode ${entryNumber} of this entry yet`,
      };
    }
    if (declaredEpisodeCount != null && entryNumber > declaredEpisodeCount) {
      return {
        ok: false,
        reason: `episode ${entryNumber} is past this entry's ${declaredEpisodeCount} episodes — no season mapping`,
      };
    }
    episodes.push({
      season: table.season,
      number: table.lastCanonicalNumber + gap,
    });
  }

  return { ok: true, episodes };
}
