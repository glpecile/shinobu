import { hasAired } from '@/lib/time/has-aired';
import {
  formatDayHeading,
  localDayAt,
  localDayOffset,
} from '@/lib/time/relative-day';
import type { NormalizedMediaItem } from '@/types/media';

import type {
  AniListUpNextInput,
  TraktUpNextInput,
  UpNextData,
  UpNextEntry,
  UpNextInputs,
} from './types';

/**
 * The pure core of Up Next (plan 0019 U3): per-show next-episode
 * classification, cross-provider dedupe, and the aired/upcoming split. No
 * Effect, no React, no ambient clock — `now` is injected, so day rollover and
 * "it aired while the app was open" correct themselves on the next render
 * instead of being frozen at fetch time (KTD-5).
 */

/**
 * How many recently-watched Trakt shows get a per-show progress request. The
 * budget, not the product, sets this: each pooled show is one authed call
 * against 1000 per 5 minutes (docs/solutions/trakt-watched-endpoints-2026-api-changes.md).
 * Shows past the cap simply don't surface — including in Calendar, since both
 * sections share the pool (KTD-2).
 */
export const UP_NEXT_POOL_SIZE = 20;

/** Calendar covers today … today+6 — "In 6 days" is the furthest label (R2). */
export const UP_NEXT_WINDOW_DAYS = 7;

/**
 * The shows worth spending progress requests on: most recently watched first
 * (`lastUpdated` is Trakt's `last_watched_at` on watched-show items). Caught-up
 * shows stay in — their `next_episode` is an *upcoming* one, which is exactly
 * what Calendar is made of, so filtering on "not caught up" would structurally
 * empty the Trakt half of it (KTD-2). Called before the fetch fan, never after.
 */
export function selectUpNextPool(
  watchedShows: readonly NormalizedMediaItem[],
  limit: number = UP_NEXT_POOL_SIZE,
): NormalizedMediaItem[] {
  return [...watchedShows]
    .sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated))
    .slice(0, Math.max(0, limit));
}

function entryId(item: NormalizedMediaItem, season: number, number: number) {
  return `${item.id}-s${season}e${number}`;
}

/**
 * Trakt's pointer is authoritative about *which* episode is next; `hasAired`
 * decides which section it lands in. A pointer with no air date at all is
 * excluded from both: unknown is not "aired", and pretending otherwise would
 * offer a quick-log for something that may not exist yet.
 */
function traktEntry(
  input: TraktUpNextInput,
  now: Date,
): UpNextEntry | null {
  const next = input.nextEpisode;
  if (next == null) return null;
  if (next.firstAired == null) return null;

  return {
    id: entryId(input.item, next.season, next.number),
    item: input.item,
    episode: {
      season: next.season,
      number: next.number,
      ...(next.title != null ? { title: next.title } : {}),
      firstAired: next.firstAired,
      ...(next.runtime != null ? { runtime: next.runtime } : {}),
    },
    status: hasAired(next.firstAired, now) ? 'aired' : 'upcoming',
    source: 'trakt',
  };
}

/**
 * AniList exposes one airing pointer per series, not per-episode instants, so
 * classification is precedence rather than a single comparison (KTD-3):
 *
 * - below the pointer → aired *by construction* (the episode is out; AniList
 *   just has no instant to prove it — the Trakt-side null-instant exclusion
 *   deliberately doesn't apply here);
 * - at the pointer → `airingAt` is the episode's instant, and `hasAired` wins
 *   over the arithmetic, so a stale cached pointer resolves as aired;
 * - past the pointer → unknowable (the schedule doesn't reach that far);
 * - no pointer at all → aired iff the total says the episode exists; both
 *   unknown means hiatus/unconfirmed, which is excluded rather than guessed.
 */
function anilistEntry(
  input: AniListUpNextInput,
  now: Date,
): UpNextEntry | null {
  // Anime *films* sit on the currently-watching list too, and have no next
  // episode to be up next for — "S1E1" of a film is a nonsense card. Upcoming
  // film releases are explicitly out of this feature's scope.
  if (input.item.isFilm === true) return null;
  const next = input.item.currentProgress + 1;
  const total = input.totalEpisodes;
  if (total != null && next > total) return null;

  const airing = input.nextAiring;
  const base = {
    id: entryId(input.item, 1, next),
    item: input.item,
    // Anime keeps the season-1 convention every other AniList write uses
    // (KTD-7) — the fan-out's own rule drops AniList for season ≠ 1.
    episode: { season: 1, number: next },
    source: 'anilist' as const,
  };

  if (airing == null) {
    if (total == null) return null;
    return { ...base, status: 'aired' };
  }
  if (next < airing.episode) return { ...base, status: 'aired' };
  if (next > airing.episode) return null;

  return {
    ...base,
    episode: { ...base.episode, firstAired: airing.airingAt },
    status: hasAired(airing.airingAt, now) ? 'aired' : 'upcoming',
  };
}

/** One local day of the Calendar window, with the entries airing that day. */
export interface UpNextDayGroup {
  /** Days from today: 0 … UP_NEXT_WINDOW_DAYS - 1. */
  offset: number;
  /** Local midnight opening the day — for weekday/date rendering. */
  date: Date;
  /** "Today" / "Tomorrow" / weekday name. */
  label: string;
  entries: UpNextEntry[];
}

/**
 * The whole window as day buckets, empty days included — the week strip needs
 * a cell for every day, and the agenda just drops the empty ones. Both read
 * their day membership from here, so a badge, a bucket header and a strip cell
 * can never disagree about which day an episode belongs to.
 */
export function calendarWeek(
  entries: readonly UpNextEntry[],
  now: Date,
): UpNextDayGroup[] {
  return Array.from({ length: UP_NEXT_WINDOW_DAYS }, (_, offset) => {
    const date = localDayAt(offset, now);
    return {
      offset,
      date,
      label: formatDayHeading(offset, date),
      entries: entries.filter(
        (entry) => localDayOffset(entry.episode.firstAired, now) === offset,
      ),
    };
  });
}

/** The agenda's buckets: the same days, minus the ones with nothing in them. */
export function groupCalendarByDay(
  entries: readonly UpNextEntry[],
  now: Date,
): UpNextDayGroup[] {
  return calendarWeek(entries, now).filter((day) => day.entries.length > 0);
}

/** Inside the local window today … today+6 (R2, shared with the week strip). */
function inCalendarWindow(entry: UpNextEntry, now: Date): boolean {
  const offset = localDayOffset(entry.episode.firstAired, now);
  return offset != null && offset >= 0 && offset < UP_NEXT_WINDOW_DAYS;
}

/**
 * Same show tracked on both providers → one card. AniList wins for anime: it
 * carries the user's anime progress and the airing schedule, and its entry is
 * what the AniList write path advances. Unresolvable TMDB ids leave the
 * duplicate standing — R5 is explicitly best-effort.
 */
function dedupeByTmdb(
  anilist: readonly UpNextEntry[],
  trakt: readonly UpNextEntry[],
  anilistTmdbIds: ReadonlySet<number>,
): UpNextEntry[] {
  const traktKept = trakt.filter((entry) => {
    const tmdbId = entry.item.externalIds.tmdb;
    return tmdbId == null || !anilistTmdbIds.has(tmdbId);
  });
  return [...anilist, ...traktKept];
}

/**
 * Both home sections from one pass. Entries appear in exactly one of them
 * (R3): aired → Continue Watching, unaired and inside the 7-day window →
 * Calendar, anything further out or unknowable → neither.
 */
export function computeUpNext(inputs: UpNextInputs, now: Date): UpNextData {
  const anilistPairs = inputs.anilist
    .map((input) => ({ input, entry: anilistEntry(input, now) }))
    .filter(
      (pair): pair is { input: AniListUpNextInput; entry: UpNextEntry } =>
        pair.entry != null,
    );
  const anilistEntries = anilistPairs.map((pair) => pair.entry);
  const traktEntries = inputs.trakt
    .map((input) => traktEntry(input, now))
    .filter((entry): entry is UpNextEntry => entry != null);

  // Only *surviving* AniList entries suppress their Trakt twin — an AniList
  // entry that classified to nothing (hiatus, caught up) must not silently
  // take the Trakt card down with it.
  const anilistTmdbIds = new Set(
    anilistPairs
      .map((pair) => pair.input.tmdbId ?? pair.input.item.externalIds.tmdb)
      .filter((id): id is number => id != null),
  );

  const entries = dedupeByTmdb(anilistEntries, traktEntries, anilistTmdbIds);

  return {
    // Most recently watched first — the same ordering the pool arrives in, so
    // the show you were last watching sits at the head of the row.
    continueWatching: entries
      .filter((entry) => entry.status === 'aired')
      .sort((a, b) => b.item.lastUpdated.localeCompare(a.item.lastUpdated)),
    // Soonest first: Calendar is read as a schedule, not as a library.
    calendar: entries
      .filter((entry) => entry.status === 'upcoming' && inCalendarWindow(entry, now))
      .sort((a, b) =>
        (a.episode.firstAired ?? '').localeCompare(b.episode.firstAired ?? ''),
      ),
  };
}
