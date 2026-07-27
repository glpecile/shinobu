import type {
  AniListUpNextInput,
  ReleaseUpNextInput,
  TraktCalendarUpNextInput,
  TraktUpNextInput,
  UpNextInputs,
  UpNextRelease,
} from '@/features/up-next/types';
import { hasAired, isDateOnly, parseLocalInstant } from '@/lib/time/has-aired';
import { localDayOffset } from '@/lib/time/relative-day';

/**
 * One notification's worth of local schedule, ready to fire (plan 0020 U3).
 * Deliberately carries no provider payload beyond what the notification copy
 * needs — `itemId` is the sole routing key on tap (KTD-6).
 */
interface NotificationCandidateBase {
  itemId: string;
  title: string;
  /** ISO instant the notification fires. */
  fireInstant: string;
}

/** An episode airing: `fireInstant` is the air instant the provider stated. */
export interface EpisodeNotificationCandidate extends NotificationCandidateBase {
  kind: 'episode';
  season: number;
  episode: number;
  /**
   * How many episodes of this show land the same local day, when more than one
   * does — a season drop notifies once (see `collapseBatches`). `season` and
   * `episode` then name the *first* of the batch, which is the airing this
   * candidate still fires on.
   *
   * Absent, never `1`, for the ordinary single-episode candidate: the batch
   * hash is built from these fields, and an optional field left unset keeps a
   * single episode's hash byte-identical to the pre-batch one, so shipping this
   * doesn't reschedule everyone's whole batch once on upgrade (R7).
   */
  count?: number;
}

/**
 * A film release day: no episode to name, so it carries the release kind
 * instead, and its `fireInstant` is the 09:00-local moment `releaseFireInstant`
 * derived — never the local midnight the date itself parses to (R10).
 */
export interface ReleaseNotificationCandidate extends NotificationCandidateBase {
  kind: 'release';
  release: UpNextRelease['kind'];
}

/**
 * Discriminated on `kind` for the same reason `UpNextEntry` is (plan 0030
 * KTD-1/KTD-7): a release has no season or episode to fabricate, and the
 * discriminant makes an unhandled arm — in the copy builder above all — a
 * compile error. One union, so both kinds ride one batch, one hash guard and
 * one cap (R9).
 */
export type NotificationCandidate =
  | EpisodeNotificationCandidate
  | ReleaseNotificationCandidate;

/** Matches Up Next's Calendar window (plan 0019) — a constant, not a design choice. */
const WINDOW_DAYS = 7;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** iOS hard-caps pending notifications at 64; 50 leaves headroom (R3). */
const MAX_SCHEDULED = 50;

/** Release day alerts land at 09:00 in the user's own timezone (R10). */
const RELEASE_HOUR_LOCAL = 9;

type RawCandidate = NotificationCandidate & { tmdbId?: number };

/**
 * When a release should actually alert (R10). A release date is a bare calendar
 * day: `parseLocalInstant` reads it as *local midnight*, which is the right
 * ordering key but a hostile alert — nobody wants "Dune is out" at 00:00. So
 * the notification moves to 09:00 local on that day, rebuilt from the local
 * calendar fields (not by adding 9h) so a DST transition on release day still
 * lands on the wall clock.
 *
 * Returns null when that moment has already gone, which is the whole reason
 * `now` is a parameter: without it every refresh after 09:00 on release day
 * would schedule a notification that fires immediately (plan 0020 R2). The
 * boundary is `hasAired`'s at-or-before rule — at exactly 09:00 the moment has
 * arrived, so it is *not* scheduled, matching how an episode instant equal to
 * `now` is treated.
 */
export function releaseFireInstant(date: string, now: Date): string | null {
  const day = parseLocalInstant(date);
  if (day == null) return null;
  // A value that already carries a time of day states one the provider meant;
  // the 09:00 rule exists only because a calendar day has none to keep.
  const fire = isDateOnly(date)
    ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), RELEASE_HOUR_LOCAL)
    : day;
  const instant = fire.toISOString();
  return hasAired(instant, now) ? null : instant;
}

function traktCandidate(input: TraktUpNextInput): RawCandidate | null {
  const next = input.nextEpisode;
  if (next == null || next.firstAired == null) return null;
  return {
    kind: 'episode',
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
    kind: 'episode',
    itemId: input.item.id,
    title: input.item.title,
    season: 1,
    episode: next,
    fireInstant: airing.airingAt,
    tmdbId: input.tmdbId ?? input.item.externalIds.tmdb,
  };
}

/**
 * The watchlist half of the agenda's episodes (plan 0030 R9). `inputs.trakt` is
 * the *watched* pool — it structurally cannot contain a show the user has never
 * started, nor one past `UP_NEXT_POOL_SIZE`, which is exactly what U4 added
 * `/calendars/my/shows` to reach. Without this the headline case of the feature
 * (watchlist a premiere, get told when it airs) renders a Calendar card and
 * then never notifies.
 */
function traktCalendarCandidate(
  input: TraktCalendarUpNextInput,
): RawCandidate | null {
  if (input.episode.firstAired == null) return null;
  return {
    kind: 'episode',
    itemId: input.item.id,
    title: input.item.title,
    season: input.episode.season,
    episode: input.episode.number,
    fireInstant: input.episode.firstAired,
    tmdbId: input.item.externalIds.tmdb,
  };
}

/**
 * A caught-up show's `next_episode` and its calendar row are the same airing
 * reached two ways, so the two Trakt sources overlap and would otherwise fire
 * twice. Keyed on the airing itself (item + season + episode) rather than TMDB
 * id, because the duplicate here is one show's one episode — not two providers
 * describing the same series.
 */
function airingKey(candidate: RawCandidate): string {
  return candidate.kind === 'episode'
    ? `${candidate.itemId}/${candidate.season}/${candidate.episode}`
    : candidate.itemId;
}

function dedupeTraktEpisodes(
  pool: readonly RawCandidate[],
  calendar: readonly RawCandidate[],
): RawCandidate[] {
  const seen = new Set(pool.map(airingKey));
  return [
    ...pool,
    ...calendar.filter((candidate) => !seen.has(airingKey(candidate))),
  ];
}

function releaseCandidate(input: ReleaseUpNextInput, now: Date): RawCandidate | null {
  const fireInstant = releaseFireInstant(input.date, now);
  if (fireInstant == null) return null;
  return {
    kind: 'release',
    itemId: input.item.id,
    title: input.item.title,
    release: input.kind,
    fireInstant,
    tmdbId: input.item.externalIds.tmdb,
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

/**
 * The same film reached the agenda from two watchlists → one notification per
 * release kind, not per source (KTD-6). Keyed on TMDB id when there is one and
 * the item id otherwise, so a Trakt and a Letterboxd row for the same film
 * collapse while its theatrical and streaming rows both survive. Deliberately
 * separate from the episode dedupe above: a film's release and a show's episode
 * are different events even when they share an id space.
 */
function dedupeReleases(releases: readonly RawCandidate[]): RawCandidate[] {
  const seen = new Set<string>();
  return releases.filter((candidate) => {
    const key = `${candidate.tmdbId ?? candidate.itemId}/${
      candidate.kind === 'release' ? candidate.release : ''
    }`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * What counts as "the same event" for collapsing. Keyed on the local **day**
 * rather than the exact instant: Trakt routinely staggers a batch's
 * `first_aired` by a minute or two, and "the season dropped" is a claim about
 * the day, not the second. Releases are excluded by construction — they are
 * already one row per kind (`dedupeReleases`), and a film's theatrical and
 * digital dates are different events even when they share a day.
 */
function batchKey(candidate: RawCandidate, now: Date): string {
  return candidate.kind === 'episode'
    ? `episode/${candidate.itemId}/${localDayOffset(candidate.fireInstant, now)}`
    : `release/${candidate.itemId}/${candidate.release}`;
}

/**
 * A whole season landing at once is **one** notification, not ten (owner
 * decision 2026-07-27) — the tray version of the ten identical Calendar cards
 * `groupDayEntries` collapses. It is also a cap problem: at ten episodes a
 * single season drop takes a fifth of `MAX_SCHEDULED`, and at twenty-four it
 * would push every other show's airing out of the batch entirely.
 *
 * The surviving candidate is the **earliest** of the batch, so the notification
 * still fires when the first episode actually lands rather than at some
 * averaged or last instant. Deliberately runs *after* the window filter: an
 * episode that aired an hour ago has already dropped out, so a partially-landed
 * batch collapses only what is still ahead and its count states what the user
 * has yet to see — not what the provider listed.
 */
function collapseBatches(
  candidates: readonly RawCandidate[],
  now: Date,
): RawCandidate[] {
  const batches = new Map<string, { lead: RawCandidate; count: number }>();
  for (const candidate of candidates) {
    const key = batchKey(candidate, now);
    const batch = batches.get(key);
    if (batch == null) {
      batches.set(key, { lead: candidate, count: 1 });
      continue;
    }
    batch.count += 1;
    if (fireOrder(candidate) < fireOrder(batch.lead)) batch.lead = candidate;
  }
  return [...batches.values()].map(({ lead, count }) =>
    count > 1 && lead.kind === 'episode' ? { ...lead, count } : lead,
  );
}

/** Future-only, inside the 7-day window: `now < instant < now + 7d` (half-open). */
function inWindow(candidate: RawCandidate, now: Date): boolean {
  const instant = parseLocalInstant(candidate.fireInstant);
  if (instant == null) return false;
  if (hasAired(candidate.fireInstant, now)) return false;
  return instant.getTime() < now.getTime() + WINDOW_MS;
}

/**
 * Sort key. Numeric, not `localeCompare` on the string: the batch now holds two
 * sources of instant and a text compare on date fields is a bug the moment the
 * shapes or offsets differ (`docs/solutions/mixed-date-only-and-instant-ordering.md`).
 * An unparseable instant can't reach here — `inWindow` dropped it — so the
 * fallback only keeps the comparator total.
 */
function fireOrder(candidate: RawCandidate): number {
  return parseLocalInstant(candidate.fireInstant)?.getTime() ?? Number.POSITIVE_INFINITY;
}

function stripTmdbId(raw: RawCandidate): NotificationCandidate {
  const { tmdbId: _tmdbId, ...candidate } = raw;
  return candidate;
}

/**
 * Deterministic given `(inputs, now)` — no clock reads inside, so DST and
 * timezone correctness fall out of `has-aired.ts`'s instant parsing rather
 * than any date arithmetic here (R1, R2, KTD-3). Episodes and releases sort,
 * window-filter and cap together: one batch, nearest-first, mixed kinds (R9).
 */
export function computeNotificationSchedule(
  inputs: UpNextInputs,
  now: Date,
): NotificationCandidate[] {
  const anilistCandidates = inputs.anilist
    .map(anilistCandidate)
    .filter((candidate): candidate is RawCandidate => candidate != null);
  const traktCandidates = dedupeTraktEpisodes(
    inputs.trakt
      .map(traktCandidate)
      .filter((candidate): candidate is RawCandidate => candidate != null),
    inputs.traktCalendar
      .map(traktCalendarCandidate)
      .filter((candidate): candidate is RawCandidate => candidate != null),
  );
  const releaseCandidates = dedupeReleases(
    inputs.releases
      .map((input) => releaseCandidate(input, now))
      .filter((candidate): candidate is RawCandidate => candidate != null),
  );

  const deduped = [
    ...dedupeByTmdb(anilistCandidates, traktCandidates),
    ...releaseCandidates,
  ];

  // Collapse before the cap, not after: the whole point is that a season drop
  // costs one slot. Sorting last keeps a collapsed batch filed under the
  // instant it actually fires on.
  return collapseBatches(
    deduped.filter((candidate) => inWindow(candidate, now)),
    now,
  )
    .sort((a, b) => fireOrder(a) - fireOrder(b))
    .slice(0, MAX_SCHEDULED)
    .map(stripTmdbId);
}

/**
 * The part of a candidate that identifies *what* it is about, alongside its
 * instant. Episodes keep their exact pre-0030 shape so widening the union does
 * not invalidate an already-stored hash and reschedule everyone's batch once —
 * which is also why the batch count only appears once there *is* one. A batch
 * that gains an eleventh episode changes subject and so reschedules, where
 * keying on the lead episode alone would leave the tray claiming ten.
 */
function candidateSubject(candidate: NotificationCandidate): string {
  if (candidate.kind === 'release') return `release:${candidate.release}`;
  const code = `${candidate.season}/${candidate.episode}`;
  return candidate.count == null ? code : `${code}x${candidate.count}`;
}

/**
 * A stable content key for the scheduled batch (KTD-3 / R7): sorted so input
 * order never matters, and it changes whenever any candidate's identity or
 * instant does — including a release date that moved, since the derived 09:00
 * instant moves with it. Not cryptographic — an MMKV equality check is all R7
 * needs.
 */
export function hashSchedule(candidates: readonly NotificationCandidate[]): string {
  return candidates
    .map((c) => `${c.itemId}/${candidateSubject(c)}/${c.fireInstant}`)
    .sort()
    .join('\n');
}
