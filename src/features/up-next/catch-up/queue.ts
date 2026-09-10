import type { SeasonLayout } from '@/lib/providers/mapping/season-layout';
import type { SimklLibraryEntry } from '@/lib/providers/simkl/normalize';
import type { TraktShowProgressResult } from '@/lib/providers/trakt/normalize';
import type { UpNextEpisode, UpNextEpisodeEntry } from '@/features/up-next/types';

/**
 * One episode the catch-up chain will offer, in the entry's own numbering
 * domain (plan 0037): `season` present for Trakt/Simkl-TV pointers, absent for
 * AniList and Simkl anime — the same rule `UpNextEpisode` states, so a chained
 * episode logs through exactly the variables the entry's own quick-log uses.
 */
export type CatchUpEpisode = Pick<UpNextEpisode, 'season' | 'number' | 'title'>;

/**
 * What each source can prove about the backlog. Every field is optional and
 * nullable because a source needs only its own: Trakt its progress read,
 * Simkl its library entry (plus a season layout for TV), AniList nothing —
 * its `episodesBehind` is already exact.
 */
export interface CatchUpEvidence {
  trakt?: TraktShowProgressResult | null;
  simkl?: Pick<SimklLibraryEntry, 'watchedKeys' | 'notAiredEpisodes'> | null;
  layout?: SeasonLayout | null;
}

/**
 * Hard stop on any walk, whatever the counts say. A backlog this deep is a
 * season picker's job, not a one-tap chain's — and it bounds the loops below
 * against a count that disagrees with the structure it walks.
 */
const MAX_CHAIN = 200;

const key = (episode: { season: number; number: number }) =>
  `${episode.season}-${episode.number}`;

/**
 * The aired-but-unwatched episodes of `entry`'s show, the entry's own first —
 * what the quick-log sheet steps through after each confirm (plan 0037 R1–R4).
 *
 * Three derivations, by what the source can prove, never by guessing a
 * structure the source didn't state:
 *
 * - **Trakt, exact.** `progress/watched` lists every aired episode; minus the
 *   completed keys, from the pointer on, that *is* the backlog — gaps and
 *   season boundaries included, no count needed.
 * - **Absolute numbering** (AniList, Simkl anime): the pointer plus one, plus
 *   one, … for `episodesBehind` episodes. Simkl's watched keys skip a gap and
 *   its aired arithmetic caps the walk; AniList's count is exact already.
 * - **Seasoned pointer without an aired list** (Simkl TV, a Trakt cache from
 *   before `airedEpisodes` was carried): the same walk across the tracker's
 *   own season layout. **No layout → the entry alone**: stepping past a season
 *   end with no structure to step into would fabricate an episode.
 *
 * Every arm returns at least the entry's own episode, so a caller never has to
 * special-case "no chain" — a one-element queue is today's single log.
 */
export function catchUpQueue(
  entry: UpNextEpisodeEntry,
  evidence: CatchUpEvidence,
): CatchUpEpisode[] {
  const { season, number, title } = entry.episode;
  const first: CatchUpEpisode = {
    ...(season != null ? { season } : {}),
    number,
    ...(title != null ? { title } : {}),
  };

  if (entry.source === 'trakt' && evidence.trakt?.airedEpisodes != null) {
    return fromTraktProgress(first, evidence.trakt);
  }

  const behind = entry.episodesBehind ?? 1;
  if (behind <= 1) return [first];

  const watched = evidence.simkl?.watchedKeys ?? new Set<string>();
  const airedCount = simklAiredCount(entry, evidence.simkl);

  if (first.season == null) {
    return absoluteWalk(first, behind, watched, airedCount);
  }
  return layoutWalk(first, behind, evidence.layout, watched, airedCount);
}

function fromTraktProgress(
  first: CatchUpEpisode,
  progress: TraktShowProgressResult,
): CatchUpEpisode[] {
  const aired = progress.airedEpisodes ?? [];
  const start = aired.findIndex(
    (episode) => episode.season === first.season && episode.number === first.number,
  );
  if (start < 0) return [first];
  const queue: CatchUpEpisode[] = [first];
  for (const episode of aired.slice(start + 1)) {
    if (queue.length >= MAX_CHAIN) break;
    // Specials never chain: Trakt's pointer never lands on season 0, and a
    // special between two seasons isn't "the next episode" of either.
    if (episode.season === 0) continue;
    if (progress.watchedKeys.has(key(episode))) continue;
    queue.push({ season: episode.season, number: episode.number });
  }
  return queue;
}

/**
 * Simkl's aired count, by the arithmetic `state/queries/up-next.ts` already
 * trusts (`total - not_aired`), or `null` when either half is unknown — never
 * 0, which would read as "nothing aired" and stop the chain at the entry.
 */
function simklAiredCount(
  entry: UpNextEpisodeEntry,
  simkl: CatchUpEvidence['simkl'],
): number | null {
  if (entry.source !== 'simkl' || simkl == null) return null;
  const total = entry.item.totalEpisodes;
  const notAired = simkl.notAiredEpisodes;
  if (total == null || notAired == null) return null;
  return total - notAired;
}

function absoluteWalk(
  first: CatchUpEpisode,
  behind: number,
  watched: ReadonlySet<string>,
  airedCount: number | null,
): CatchUpEpisode[] {
  const queue: CatchUpEpisode[] = [first];
  let number = first.number;
  let steps = 0;
  while (queue.length < behind && queue.length < MAX_CHAIN && steps < MAX_CHAIN) {
    number += 1;
    steps += 1;
    if (airedCount != null && number > airedCount) break;
    // Simkl files anime under season 1 (AniDB convention); AniList carries no
    // keys, so the lookup is a no-op there and the count alone bounds it.
    if (watched.has(key({ season: 1, number }))) continue;
    queue.push({ number });
  }
  return queue;
}

function layoutWalk(
  first: CatchUpEpisode & { season?: number },
  behind: number,
  layout: SeasonLayout | null | undefined,
  watched: ReadonlySet<string>,
  airedCount: number | null,
): CatchUpEpisode[] {
  const seasons = (layout ?? [])
    .filter((slot) => slot.season >= 1 && slot.episodeCount > 0)
    .sort((a, b) => a.season - b.season);
  let slot = seasons.findIndex((candidate) => candidate.season === first.season);
  if (slot < 0) return [first];

  const queue: CatchUpEpisode[] = [first];
  let number = first.number;
  // Absolute position of the pointer inside the layout, for the aired cap:
  // episodes air in order, so "the first `airedCount` in layout order" is the
  // aired set.
  let absolute =
    seasons.slice(0, slot).reduce((sum, s) => sum + s.episodeCount, 0) + number;
  let steps = 0;
  while (queue.length < behind && queue.length < MAX_CHAIN && steps < MAX_CHAIN) {
    steps += 1;
    if (number >= seasons[slot].episodeCount) {
      slot += 1;
      if (slot >= seasons.length) break;
      number = 1;
    } else {
      number += 1;
    }
    absolute += 1;
    if (airedCount != null && absolute > airedCount) break;
    const episode = { season: seasons[slot].season, number };
    if (watched.has(key(episode))) continue;
    queue.push(episode);
  }
  return queue;
}

/** "episode 4" / "S2E4" — the sheet's copy for a queued episode. */
export function catchUpEpisodeCode(episode: CatchUpEpisode): string {
  return episode.season == null
    ? `episode ${episode.number}`
    : `S${episode.season}E${episode.number}`;
}
