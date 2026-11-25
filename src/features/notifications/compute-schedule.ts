import { identityKeys } from '@/features/up-next/compute';
import type {
  AniListUpNextInput,
  CalendarUpNextInput,
  ProgressUpNextInput,
  ReleaseUpNextInput,
  UpNextInputs,
  UpNextRelease,
} from '@/features/up-next/types';
import { Provider, type ProviderId } from '@/lib/providers/types';
import { hasAired, isDateOnly, parseLocalInstant } from '@/lib/time/has-aired';
import { localDayOffset } from '@/lib/time/relative-day';

interface NotificationCandidateBase {
  itemId: string;
  title: string;
  fireInstant: string;
}

export interface EpisodeNotificationCandidate extends NotificationCandidateBase {
  kind: 'episode';
  season: number;
  episode: number;
  /** Episode count for same-day season drops (> 1); omitted for single episodes. */
  count?: number;
}

export interface ReleaseNotificationCandidate extends NotificationCandidateBase {
  kind: 'release';
  release: UpNextRelease['kind'];
}

export type NotificationCandidate =
  | EpisodeNotificationCandidate
  | ReleaseNotificationCandidate;

export type NotificationKind = 'episode' | ReleaseNotificationCandidate['release'];

export const NOTIFICATION_KINDS: readonly { kind: NotificationKind; label: string }[] = [
  { kind: 'episode', label: 'New episodes' },
  { kind: 'theatrical', label: 'In theaters' },
  { kind: 'digital', label: 'Streaming releases' },
  { kind: 'physical', label: 'Disc releases' },
];

export function notificationKind(candidate: NotificationCandidate): NotificationKind {
  return candidate.kind === 'release' ? candidate.release : 'episode';
}

const WINDOW_DAYS = 7;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

// iOS hard-caps pending local notifications at 64.
const MAX_SCHEDULED = 50;

const RELEASE_HOUR_LOCAL = 9;

type RawCandidate = NotificationCandidate & {
  keys: string[];
  source?: ProviderId;
};

function sharesIdentity(
  candidate: RawCandidate,
  keys: ReadonlySet<string>,
): boolean {
  return candidate.keys.some((key) => keys.has(key));
}

/** Moves bare calendar release dates to 09:00 local wall-clock (DST-safe); returns null once that instant has passed. */
export function releaseFireInstant(date: string, now: Date): string | null {
  const day = parseLocalInstant(date);
  if (day == null) return null;
  const fire = isDateOnly(date)
    ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), RELEASE_HOUR_LOCAL)
    : day;
  const instant = fire.toISOString();
  return hasAired(instant, now) ? null : instant;
}

function progressCandidate(input: ProgressUpNextInput): RawCandidate | null {
  const next = input.nextEpisode;
  if (next == null || next.firstAired == null) return null;
  return {
    kind: 'episode',
    itemId: input.item.id,
    title: input.item.title,
    // Simkl anime pointers have no canonical season (absolute numbering); display/hash only.
    season: next.season ?? 1,
    episode: next.number,
    fireInstant: next.firstAired,
    keys: identityKeys(input.item.externalIds),
    source: input.source,
  };
}

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
    keys: identityKeys({
      ...input.item.externalIds,
      ...(input.tmdbId != null ? { tmdb: input.tmdbId } : {}),
    }),
  };
}

function calendarCandidate(input: CalendarUpNextInput): RawCandidate | null {
  if (input.episode.firstAired == null) return null;
  return {
    kind: 'episode',
    itemId: input.item.id,
    title: input.item.title,
    season: input.episode.season ?? 1,
    episode: input.episode.number,
    fireInstant: input.episode.firstAired,
    keys: identityKeys(input.item.externalIds),
    source: input.source,
  };
}

function airingKey(candidate: RawCandidate): string {
  return candidate.kind === 'episode'
    ? `${candidate.itemId}/${candidate.season}/${candidate.episode}`
    : candidate.itemId;
}

function dedupeEpisodeSources(
  pool: readonly RawCandidate[],
  calendar: readonly RawCandidate[],
): RawCandidate[] {
  const seen = new Set(pool.map(airingKey));
  return [
    ...pool,
    ...calendar.filter((candidate) => !seen.has(airingKey(candidate))),
  ];
}

function dedupeTrackers(candidates: readonly RawCandidate[]): RawCandidate[] {
  const simklKeys = new Set(
    candidates
      .filter((candidate) => candidate.source === Provider.Simkl)
      .flatMap((candidate) => candidate.keys),
  );
  if (simklKeys.size === 0) return [...candidates];
  return candidates.filter(
    (candidate) =>
      candidate.source === Provider.Simkl || !sharesIdentity(candidate, simklKeys),
  );
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
    keys: identityKeys(input.item.externalIds),
  };
}

function dedupeAniList(
  anilist: readonly RawCandidate[],
  trackers: readonly RawCandidate[],
): RawCandidate[] {
  const anilistKeys = new Set(anilist.flatMap((candidate) => candidate.keys));
  return [
    ...anilist,
    ...trackers.filter((candidate) => !sharesIdentity(candidate, anilistKeys)),
  ];
}

function dedupeReleases(releases: readonly RawCandidate[]): RawCandidate[] {
  const seen = new Set<string>();
  return releases.filter((candidate) => {
    const kind = candidate.kind === 'release' ? candidate.release : '';
    const base = candidate.keys.length > 0 ? candidate.keys : [candidate.itemId];
    const keys = base.map((key) => `${key}/${kind}`);
    if (keys.some((key) => seen.has(key))) return false;
    for (const key of keys) seen.add(key);
    return true;
  });
}

// Keyed by local day because Trakt often staggers a season drop's first_aired timestamps by minutes.
function batchKey(candidate: RawCandidate, now: Date): string {
  return candidate.kind === 'episode'
    ? `episode/${candidate.itemId}/${localDayOffset(candidate.fireInstant, now)}`
    : `release/${candidate.itemId}/${candidate.release}`;
}

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

function inWindow(candidate: RawCandidate, now: Date): boolean {
  const instant = parseLocalInstant(candidate.fireInstant);
  if (instant == null) return false;
  if (hasAired(candidate.fireInstant, now)) return false;
  return instant.getTime() < now.getTime() + WINDOW_MS;
}

// Numeric timestamp sort avoids mixed date/offset string bugs (docs/solutions/mixed-date-only-and-instant-ordering.md).
function fireOrder(candidate: RawCandidate): number {
  return parseLocalInstant(candidate.fireInstant)?.getTime() ?? Number.POSITIVE_INFINITY;
}

function stripInternalFields(raw: RawCandidate): NotificationCandidate {
  const { keys: _keys, source: _source, ...candidate } = raw;
  return candidate;
}

export function computeNotificationSchedule(
  inputs: UpNextInputs,
  now: Date,
  muted: ReadonlySet<NotificationKind> = new Set(),
): NotificationCandidate[] {
  const anilistCandidates = inputs.anilist
    .map(anilistCandidate)
    .filter((candidate): candidate is RawCandidate => candidate != null);
  const trackerCandidates = dedupeTrackers(
    dedupeEpisodeSources(
      inputs.progress
        .map(progressCandidate)
        .filter((candidate): candidate is RawCandidate => candidate != null),
      inputs.calendar
        .map(calendarCandidate)
        .filter((candidate): candidate is RawCandidate => candidate != null),
    ),
  );
  const releaseCandidates = dedupeReleases(
    inputs.releases
      .map((input) => releaseCandidate(input, now))
      .filter((candidate): candidate is RawCandidate => candidate != null),
  );

  const deduped = [
    ...dedupeAniList(anilistCandidates, trackerCandidates),
    ...releaseCandidates,
  ];

  return collapseBatches(
    deduped.filter(
      (candidate) => inWindow(candidate, now) && !muted.has(notificationKind(candidate)),
    ),
    now,
  )
    .sort((a, b) => fireOrder(a) - fireOrder(b))
    .slice(0, MAX_SCHEDULED)
    .map(stripInternalFields);
}

function candidateSubject(candidate: NotificationCandidate): string {
  if (candidate.kind === 'release') return `release:${candidate.release}`;
  const code = `${candidate.season}/${candidate.episode}`;
  return candidate.count == null ? code : `${code}x${candidate.count}`;
}

export function hashSchedule(candidates: readonly NotificationCandidate[]): string {
  return candidates
    .map((c) => `${c.itemId}/${candidateSubject(c)}/${c.fireInstant}`)
    .sort()
    .join('\n');
}
