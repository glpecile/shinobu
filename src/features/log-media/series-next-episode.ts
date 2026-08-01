import { hasAired } from '@/lib/time/has-aired';
import type { SimklLibraryEntry } from '@/lib/providers/simkl/normalize';
import type { TraktShowProgressResult } from '@/lib/providers/trakt/normalize';

export interface SeriesNextEpisode {
  season: number;
  number: number;
  title?: string;
  /**
   * Timezone-correct (`lib/time/has-aired`). An episode Trakt knows but has no
   * air date for counts as aired — same permissive rule the anime path uses,
   * so a catalogue gap never blocks a legitimate log.
   */
  aired: boolean;
  /**
   * True when this isn't a *next* episode at all — the show is finished and
   * the episode is the wrap back to the start. Callers must say so rather
   * than presenting S1E1 as if it were up next.
   */
  rewatch: boolean;
  /**
   * True when **nothing has aired yet** (plan 0035 R17/KTD4). Also a
   * `next_episode: null` state, and for years indistinguishable from `rewatch`
   * — an announced show presented as "🎉 You've watched every aired episode"
   * with a rewatch CTA, which is a lie about a show nobody could have seen.
   * `aired` is what discriminates them, so it is carried through normalization
   * rather than re-derived per consumer.
   *
   * `rewatch` stays false here: the two are mutually exclusive, and every
   * caller that gates celebration copy on `rewatch` keeps working unchanged.
   */
  unaired: boolean;
}

/** A show with nothing left to watch restarts here — see the wrap below. */
const FIRST_EPISODE = { season: 1, number: 1 } as const;

/** The finished-show wrap: S1E1, flagged so no caller calls it "up next". */
const REWATCH_WRAP: SeriesNextEpisode = {
  ...FIRST_EPISODE,
  aired: true,
  rewatch: true,
  unaired: false,
};

/**
 * The announced-but-unaired state (R18). Still S1E1 — that *is* the episode a
 * log would eventually write — but `aired: false` blocks the write and the CTA
 * reads that the show hasn't aired, the series analogue of `filmReleaseStatus`.
 */
const UNAIRED: SeriesNextEpisode = {
  ...FIRST_EPISODE,
  aired: false,
  rewatch: false,
  unaired: true,
};

/**
 * Trakt's watched progress → the episode a one-tap log would write. Kept pure
 * (and free of any React Native import, so `bun test` can load it) because the
 * two rules that matter are worth asserting: the completed-show wrap, and the
 * permissive unknown-air-date gate.
 */
export function nextEpisodeFromProgress(
  progress: TraktShowProgressResult,
): SeriesNextEpisode {
  const next = progress.nextEpisode;
  // Trakt sends `next_episode: null` in two very different situations, and the
  // aired count is the only thing that tells them apart (plan 0035 KTD4):
  //
  //   aired === 0 → nothing has aired; nobody could have watched anything.
  //   aired  > 0  → every aired episode is watched. A finished show.
  //
  // Wrapping the second to S1E1 mirrors the anime button (`progress >= total →
  // 1`): a finished show offers a rewatch rather than going dead. The first
  // used to fall into that same branch and celebrate a show that hasn't
  // started. `aired` absent (progress cached before it was carried) takes the
  // rewatch path, so an old cache behaves exactly as it did.
  if (next == null) return progress.aired === 0 ? UNAIRED : REWATCH_WRAP;

  return {
    season: next.season,
    number: next.number,
    ...(next.title != null ? { title: next.title } : {}),
    // Untouched by the above (R19): a *known* next episode with no air date
    // stays logable. "Nothing has aired" and "we don't know when this airs"
    // are different facts and only the first blocks a log.
    aired: next.firstAired == null ? true : hasAired(next.firstAired),
    rewatch: false,
    unaired: false,
  };
}

/**
 * Simkl's counterpart of `nextEpisodeFromProgress` (plan 0034): the `watching`
 * snapshot's server-computed `next_to_watch` pointer → the episode a one-tap
 * log would write. `null` means "can't name it" — the season picker takes
 * over, never a guessed episode.
 *
 * - Entry with a pointer: that episode, air-gated by its instant when Simkl
 *   carries one; a null date counts as aired (the same permissive
 *   catalogue-gap rule the Trakt path applies — Up Next's stricter
 *   aired-by-count arithmetic is for auto-surfacing, not for blocking a
 *   deliberate log).
 * - Entry without a pointer: nothing aired → `unaired`; everything aired
 *   watched → the S1E1 rewatch wrap (plan 0035 KTD4, the Simkl half); **still
 *   part-way through → unnameable.** That last case is why the wrap can't just
 *   be "aired > 0": Simkl omits the pointer for any entry parked outside
 *   `watching`, so a 10-of-20 show read out of the `plantowatch` snapshot used
 *   to report as finished and offer a rewatch of S1E1.
 * - No entry (the snapshots don't list this show): a fresh show starts at S1E1,
 *   a finished one (progress ≥ total) wraps to a rewatch, and a mid-show one is
 *   unnameable — nothing here knows which season its next episode falls in.
 * - A TV pointer without a season number (Simkl's absolute anime numbering
 *   leaking onto a show) is unnameable rather than mislabeled as season 1.
 */
export function nextEpisodeFromSimklEntry(
  item: { currentProgress: number; totalEpisodes: number | null | undefined },
  entry: Pick<SimklLibraryEntry, 'nextToWatch' | 'notAiredEpisodes'> | null,
): SeriesNextEpisode | null {
  if (entry != null) {
    const next = entry.nextToWatch;
    if (next == null) {
      const aired = simklAiredCount(item, entry);
      if (aired === 0) return UNAIRED;
      // Unknown aired count keeps the rewatch path it always had; a *known*
      // one only earns the wrap when the user has actually caught up.
      if (aired != null && item.currentProgress < aired) return null;
      return REWATCH_WRAP;
    }
    if (next.season == null) return null;
    return {
      season: next.season,
      number: next.episode,
      ...(next.title != null ? { title: next.title } : {}),
      aired: next.date == null ? true : hasAired(next.date),
      rewatch: false,
      unaired: false,
    };
  }
  if (item.currentProgress === 0) {
    return { ...FIRST_EPISODE, aired: true, rewatch: false, unaired: false };
  }
  if (
    item.totalEpisodes != null &&
    item.currentProgress >= item.totalEpisodes
  ) {
    return REWATCH_WRAP;
  }
  return null;
}

/**
 * How many episodes have aired, by the arithmetic Simkl already supports
 * (`total - not_aired`, the same shape as `simklAiredByCount` in
 * `state/queries/up-next.ts`). Returns `null` when either count is missing —
 * **not** 0: an absent count is "we don't know", and treating it as zero-aired
 * would turn every entry Simkl reports thinly into a false "hasn't aired yet".
 * Unknown takes the rewatch path, exactly as it did before this state existed.
 */
function simklAiredCount(
  item: { totalEpisodes: number | null | undefined },
  entry: Pick<SimklLibraryEntry, 'notAiredEpisodes'>,
): number | null {
  const { totalEpisodes } = item;
  const notAired = entry.notAiredEpisodes;
  if (totalEpisodes == null || notAired == null) return null;
  return totalEpisodes - notAired;
}

/** Display form of an episode reference — "S2E5". */
export function seriesEpisodeLabel(episode: {
  season: number;
  number: number;
}): string {
  return `S${episode.season}E${episode.number}`;
}
