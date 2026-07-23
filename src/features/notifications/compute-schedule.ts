import type {
  AniListUpNextInput,
  TraktUpNextInput,
  UpNextInputs,
} from '@/features/up-next/types';
import { hasAired, parseLocalInstant } from '@/lib/time/has-aired';

/**
 * One episode worth of local notification, ready to schedule (plan 0020 U3).
 * Deliberately carries no provider payload beyond what the notification copy
 * needs — `itemId` is the sole routing key on tap (KTD-6).
 */
export interface NotificationCandidate {
  itemId: string;
  title: string;
  season: number;
  episode: number;
  /** ISO instant the episode airs. */
  fireInstant: string;
}

/** Matches Up Next's Calendar window (plan 0019) — a constant, not a design choice. */
const WINDOW_DAYS = 7;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** iOS hard-caps pending notifications at 64; 50 leaves headroom (R3). */
const MAX_SCHEDULED = 50;

interface RawCandidate extends NotificationCandidate {
  tmdbId?: number;
}

function traktCandidate(input: TraktUpNextInput): RawCandidate | null {
  const next = input.nextEpisode;
  if (next == null || next.firstAired == null) return null;
  return {
    itemId: input.item.id,
    title: input.item.title,
    season: next.season,
    episode: next.number,
    fireInstant: next.firstAired,
    tmdbId: input.item.externalIds.tmdb,
  };
}

/**
 * Only the "at the pointer" AniList case carries a real air instant — back
 * episodes and out-of-range episodes have nothing to schedule against, and
 * films have no next episode at all (mirrors `up-next/compute.ts`).
 */
function anilistCandidate(input: AniListUpNextInput): RawCandidate | null {
  if (input.item.isFilm === true) return null;
  const airing = input.nextAiring;
  if (airing == null) return null;
  const next = input.item.currentProgress + 1;
  if (next !== airing.episode) return null;

  return {
    itemId: input.item.id,
    title: input.item.title,
    season: 1,
    episode: next,
    fireInstant: airing.airingAt,
    tmdbId: input.tmdbId ?? input.item.externalIds.tmdb,
  };
}

/**
 * Same show tracked on both providers → one notification. AniList wins for
 * anime, matching the Up Next dedupe precedence (plan 0019 R5).
 */
function dedupeByTmdb(
  anilist: readonly RawCandidate[],
  trakt: readonly RawCandidate[],
): RawCandidate[] {
  const anilistTmdbIds = new Set(
    anilist
      .map((candidate) => candidate.tmdbId)
      .filter((id): id is number => id != null),
  );
  const traktKept = trakt.filter(
    (candidate) =>
      candidate.tmdbId == null || !anilistTmdbIds.has(candidate.tmdbId),
  );
  return [...anilist, ...traktKept];
}

/** Future-only, inside the 7-day window: `now < instant < now + 7d` (half-open). */
function inWindow(candidate: RawCandidate, now: Date): boolean {
  const instant = parseLocalInstant(candidate.fireInstant);
  if (instant == null) return false;
  if (hasAired(candidate.fireInstant, now)) return false;
  return instant.getTime() < now.getTime() + WINDOW_MS;
}

/**
 * Deterministic given `(inputs, now)` — no clock reads inside, so DST and
 * timezone correctness fall out of `has-aired.ts`'s instant parsing rather
 * than any date arithmetic here (R1, R2, KTD-3).
 */
export function computeNotificationSchedule(
  inputs: UpNextInputs,
  now: Date,
): NotificationCandidate[] {
  const anilistCandidates = inputs.anilist
    .map(anilistCandidate)
    .filter((candidate): candidate is RawCandidate => candidate != null);
  const traktCandidates = inputs.trakt
    .map(traktCandidate)
    .filter((candidate): candidate is RawCandidate => candidate != null);

  const deduped = dedupeByTmdb(anilistCandidates, traktCandidates);

  return deduped
    .filter((candidate) => inWindow(candidate, now))
    .sort((a, b) => a.fireInstant.localeCompare(b.fireInstant))
    .slice(0, MAX_SCHEDULED)
    .map(({ tmdbId: _tmdbId, ...candidate }) => candidate);
}

/**
 * A stable content key for the scheduled batch (KTD-3 / R7): sorted so input
 * order never matters, and it changes whenever any candidate's identity or
 * instant does. Not cryptographic — an MMKV equality check is all R7 needs.
 */
export function hashSchedule(candidates: readonly NotificationCandidate[]): string {
  return candidates
    .map((c) => `${c.itemId}/${c.season}/${c.episode}/${c.fireInstant}`)
    .sort()
    .join('\n');
}
