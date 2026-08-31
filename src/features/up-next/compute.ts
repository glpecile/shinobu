import { hasAired, parseLocalInstant } from '@/lib/time/has-aired';
import {
  formatDayHeading,
  localDayAt,
  localDayOffset,
} from '@/lib/time/relative-day';
import type { NormalizedMediaItem } from '@/types/media';

import { entryInstant } from './entry';
import type {
  AniListUpNextInput,
  CalendarUpNextInput,
  ProgressUpNextInput,
  ReleaseUpNextInput,
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
 * Shows past the cap don't reach **Continue Watching** — that is the whole
 * remaining cost of the cap. Calendar no longer pays it: it reads
 * `/calendars/my/shows` instead, one call for every watched *or watchlisted*
 * show (KTD-2).
 */
export const UP_NEXT_POOL_SIZE = 20;

/** Calendar covers today … today+6 — "In 6 days" is the furthest label (R2). */
export const UP_NEXT_WINDOW_DAYS = 7;

/**
 * The shows worth spending progress requests on: most recently watched first
 * (`lastUpdated` is Trakt's `last_watched_at` on watched-show items). Called
 * before the fetch fan, so it can only rank by recency — whether a show is
 * caught up is what the progress call itself answers, and a caught-up show's
 * upcoming pointer is now the calendar's business rather than the pool's.
 */
export function selectUpNextPool(
  watchedShows: readonly NormalizedMediaItem[],
  limit: number = UP_NEXT_POOL_SIZE,
): NormalizedMediaItem[] {
  return [...watchedShows]
    .sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated))
    .slice(0, Math.max(0, limit));
}

function entryId(
  item: NormalizedMediaItem,
  season: number | undefined,
  number: number,
) {
  return season == null
    ? `${item.id}-e${number}`
    : `${item.id}-s${season}e${number}`;
}

/**
 * A tracker's pointer is authoritative about *which* episode is next, and this
 * source answers for Continue Watching **only** (KTD-2): an unaired pointer
 * yields nothing here, because the tracker's calendar states the same airing
 * for a strictly larger set of shows. Emitting it from both would put the same
 * episode in the section twice for pooled shows and once for everything else —
 * a double source is worse than either one alone.
 *
 * A pointer with no air date is excluded *unless the provider's counts prove
 * it aired* (`nextEpisodeAiredByCount` — Simkl's watched-vs-aired arithmetic,
 * plan 0034 U8): unknown is not "aired", and pretending otherwise would offer
 * a quick-log for something that may not exist yet. The proven case emits an
 * instant-less aired entry — the same shape as an AniList back-episode, which
 * every consumer already renders (no time badge, no week cell). This is also
 * how a tracked Simkl show whose episode aired *before* the rolling CDN
 * calendar window still classifies as aired rather than being hidden.
 */
function progressEntry(
  input: ProgressUpNextInput,
  now: Date,
): UpNextEntry | null {
  const next = input.nextEpisode;
  if (next == null) return null;
  const behind =
    input.episodesBehind != null && input.episodesBehind > 0
      ? { episodesBehind: input.episodesBehind }
      : {};
  if (next.firstAired == null) {
    if (input.nextEpisodeAiredByCount !== true) return null;
    return {
      kind: 'episode',
      id: entryId(input.item, next.season, next.number),
      item: input.item,
      episode: {
        ...(next.season != null ? { season: next.season } : {}),
        number: next.number,
        ...(next.title != null ? { title: next.title } : {}),
        ...(next.runtime != null ? { runtime: next.runtime } : {}),
      },
      status: 'aired',
      source: input.source,
      ...behind,
    };
  }
  if (!hasAired(next.firstAired, now)) return null;

  return {
    kind: 'episode',
    id: entryId(input.item, next.season, next.number),
    item: input.item,
    episode: {
      ...(next.season != null ? { season: next.season } : {}),
      number: next.number,
      ...(next.title != null ? { title: next.title } : {}),
      firstAired: next.firstAired,
      ...(next.runtime != null ? { runtime: next.runtime } : {}),
    },
    status: 'aired',
    source: input.source,
    ...behind,
  };
}

/**
 * The mirror of `progressEntry`: Calendar's tracker half, and never Continue
 * Watching. An airing the calendar reports for *earlier today* is dropped
 * rather than promoted to `aired` — the calendar speaks for watchlisted and
 * un-started shows too, and "episode 1 of a show you have never opened aired
 * this morning" is not something waiting to be quick-logged (R4). When the user
 * *is* watching that show, the progress leg already produced the same episode.
 */
function calendarEntry(
  input: CalendarUpNextInput,
  now: Date,
): UpNextEntry | null {
  const { episode } = input;
  if (hasAired(episode.firstAired, now)) return null;

  return {
    kind: 'episode',
    id: entryId(input.item, episode.season, episode.number),
    item: input.item,
    episode: {
      ...(episode.season != null ? { season: episode.season } : {}),
      number: episode.number,
      ...(episode.title != null ? { title: episode.title } : {}),
      ...(episode.firstAired != null ? { firstAired: episode.firstAired } : {}),
      ...(episode.runtime != null ? { runtime: episode.runtime } : {}),
      ...(input.finale != null ? { finale: input.finale } : {}),
    },
    status: 'upcoming',
    source: input.source,
  };
}

/**
 * A film release is `upcoming` unconditionally — never `aired` (R3/R5). A
 * release has nothing to log and no progress to advance, so classifying one as
 * aired would drop a film into Continue Watching, which means "waiting for
 * you, one tap away". Whether it is *still* upcoming is the window's job:
 * `inCalendarWindow` drops anything whose local day is already past, so a film
 * that came out yesterday contributes nothing while one out today still shows
 * on the today cell.
 */
function releaseEntry(input: ReleaseUpNextInput): UpNextEntry {
  return {
    kind: 'release',
    // The kind is part of the key, not decoration: theatrical and digital are
    // two rows for one film and must not collide as list keys (R3).
    id: `${input.item.id}-${input.kind}`,
    item: input.item,
    release: { kind: input.kind, date: input.date },
    status: 'upcoming',
    source: input.source,
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
 *
 * Status-blind on purpose — `anilistEntry` gates the result. Classifying and
 * gating in one pass would mean checking PLANNING at four separate returns.
 */
function classifyAnilistEntry(
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
    kind: 'episode' as const,
    id: entryId(input.item, undefined, next),
    item: input.item,
    // No season at all (plan 0027): `next` is entry-relative — the AniList
    // entry's own numbering — and only ani.zip's table knows which canonical
    // season it belongs to. Stamping `season: 1` here is what made a
    // sequel-season quick log write phantom season-1 history to Trakt.
    episode: { number: next },
    source: 'anilist' as const,
  };

  if (airing == null) {
    if (total == null) return null;
    // Fully-aired run: everything past the user's progress is out.
    return {
      ...base,
      status: 'aired',
      episodesBehind: total - input.item.currentProgress,
    };
  }
  if (next < airing.episode) {
    // Aired-by-construction count: every episode below the pointer is out.
    return {
      ...base,
      status: 'aired',
      episodesBehind: airing.episode - 1 - input.item.currentProgress,
    };
  }
  if (next > airing.episode) return null;

  const aired = hasAired(airing.airingAt, now);
  return {
    ...base,
    episode: { ...base.episode, firstAired: airing.airingAt },
    status: aired ? 'aired' : 'upcoming',
    // At the pointer, the pointer's episode is the only aired-unwatched one.
    ...(aired ? { episodesBehind: 1 } : {}),
  };
}

/**
 * A PLANNING entry can only ever be `upcoming` (KTD-3). The list read now
 * carries plan-to-watch entries (R12), and their progress is 0 — so a PLANNING
 * series that is already five episodes into its run computes `next = 1`, falls
 * below the airing pointer, and classifies as `aired`: without this gate the
 * user's entire plan-to-watch backlog pours into Continue Watching, which means
 * "aired, waiting, one tap away" (R4).
 *
 * A mid-run PLANNING series therefore yields *nothing at all* rather than
 * moving to Calendar. It is not up next (nothing has been started), and
 * episode 1 having aired weeks ago is not a calendar event either — only a
 * PLANNING series whose next airing is still ahead has anything to say about
 * this week.
 */
function anilistEntry(
  input: AniListUpNextInput,
  now: Date,
): UpNextEntry | null {
  const entry = classifyAnilistEntry(input, now);
  if (entry == null) return null;
  if (input.status === 'PLANNING' && entry.status !== 'upcoming') return null;
  return entry;
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
 * a cell for every day. Buckets whatever entries it is given by their air day,
 * so passing *both* sections lands today's already-aired episodes on the today
 * cell alongside what is still upcoming: the strip is a schedule, not a
 * mirror of the aired/upcoming split. Entries with no instant (AniList
 * back-episodes) or one outside the window fall out — they have no cell.
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
        (entry) => localDayOffset(entryInstant(entry), now) === offset,
      ),
    };
  });
}

/** Inside the local window today … today+6 (R2, shared with the week strip). */
function inCalendarWindow(entry: UpNextEntry, now: Date): boolean {
  const offset = localDayOffset(entryInstant(entry), now);
  return offset != null && offset >= 0 && offset < UP_NEXT_WINDOW_DAYS;
}

/**
 * Same show tracked on both trackers → one row per section, Simkl's row (plan
 * 0034 KTD-10/R10): Simkl is the primary calendar source, so its metadata and
 * air instant win a conflict with Trakt's. Keyed on `(tmdbId, status)` rather
 * than the id alone so the sections stay complementary — Trakt's aired pointer
 * survives when Simkl only has an upcoming airing to state (and vice versa),
 * exactly like one show legitimately holding a row in each section. Only
 * cross-tracker rows collapse; two Simkl airings of one show (this week's E5
 * and E6) are two genuine calendar rows and both stand. No TMDB id leaves the
 * duplicate standing — best-effort, the same R5 rule as the AniList dedupe.
 */
function dedupeTrackerEpisodes(entries: readonly UpNextEntry[]): UpNextEntry[] {
  const simklKeys = new Set(
    entries
      .filter((entry) => entry.kind === 'episode' && entry.source === 'simkl')
      .flatMap((entry) =>
        identityKeys(entry.item.externalIds).map(
          (key) => `${key}:${entry.status}`,
        ),
      ),
  );
  if (simklKeys.size === 0) return [...entries];
  return entries.filter((entry) => {
    if (entry.kind !== 'episode' || entry.source === 'simkl') return true;
    return !identityKeys(entry.item.externalIds).some((key) =>
      simklKeys.has(`${key}:${entry.status}`),
    );
  });
}

/**
 * Namespaced identity keys for cross-provider matching. TMDB alone is not
 * enough: Simkl's anime calendar frequently states tvdb/imdb/mal but no tmdb,
 * while an AniList entry's ani.zip mapping states tvdb/imdb — so the same show
 * only collapses when the join considers every id both sides can carry (plan
 * 0034 U9.5, the "Youjo Senki II" / "Saga of Tanya the Evil" duplicate).
 * Namespacing keeps a tvdb number from ever colliding with a tmdb one.
 */
function identityKeys(
  ids: UpNextEntry['item']['externalIds'],
): string[] {
  const keys: string[] = [];
  if (ids.tmdb != null) keys.push(`tmdb:${ids.tmdb}`);
  if (ids.tvdb != null) keys.push(`tvdb:${ids.tvdb}`);
  if (ids.imdb != null) keys.push(`imdb:${ids.imdb}`);
  if (ids.mal != null) keys.push(`mal:${ids.mal}`);
  if (ids.anilist != null) keys.push(`anilist:${ids.anilist}`);
  return keys;
}

/**
 * Same show tracked on both providers → one card. AniList wins for anime: it
 * carries the user's anime progress and the airing schedule, and its entry is
 * what the AniList write path advances. The join runs over every shared
 * identity key (tmdb/tvdb/imdb/mal/anilist — see `identityKeys`); entries with
 * no resolvable id at all leave the duplicate standing — R5 stays best-effort.
 *
 * Films dedupe on the *pair* `(tmdbId, release.kind)` instead (KTD-6): one film
 * on two watchlists is one TMDB id, but its theatrical and digital rows are
 * different events with different dates, so keying on the id alone would show
 * whichever one arrived first and silently swallow the other.
 */
function dedupeByTmdb(
  anilist: readonly UpNextEntry[],
  others: readonly UpNextEntry[],
  anilistIdKeys: ReadonlySet<string>,
): UpNextEntry[] {
  const kept = others.filter((entry) => {
    // Only an episode can be an AniList entry's twin: anime *films* never
    // produce an AniList entry, so a numeric collision between a TMDB movie id
    // and a TMDB series id must not eat a release row.
    if (entry.kind !== 'episode') return true;
    return !identityKeys(entry.item.externalIds).some((key) =>
      anilistIdKeys.has(key),
    );
  });
  return dedupeReleases([...anilist, ...kept]);
}

/**
 * Collapses repeat release rows across sources. Episodes pass through
 * untouched on purpose: one show legitimately contributes both an aired episode
 * (Continue Watching) and next week's (Calendar), and they share a TMDB id.
 */
function dedupeReleases(entries: readonly UpNextEntry[]): UpNextEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (entry.kind !== 'release') return true;
    const tmdbId = entry.item.externalIds.tmdb;
    // No id is not "same film" — an unmatchable duplicate stands, exactly as it
    // does for shows.
    if (tmdbId == null) return true;
    const key = `${tmdbId}-${entry.release.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Ordering key for the schedule: the parsed instant, not the raw string.
 * Episodes state a full ISO instant (usually UTC) and releases a bare local
 * day, so a lexical compare of the two is not a comparison of times at all — it
 * would file a release ahead of an episode airing earlier that same evening,
 * and mis-order every entry whose UTC day differs from its local one. Entries
 * with no instant sort last; they have no place in a schedule to begin with.
 */
function entryOrder(entry: UpNextEntry): number {
  const instant = entryInstant(entry);
  const parsed = instant == null ? null : parseLocalInstant(instant);
  return parsed?.getTime() ?? Number.POSITIVE_INFINITY;
}

/**
 * Both home sections from one pass. Entries appear in exactly one of them
 * (R3): aired → Continue Watching, unaired and inside the 7-day window →
 * Calendar, anything further out or unknowable → neither.
 *
 * Which source can reach which section is fixed here rather than filtered
 * later (KTD-2): the pool fan produces only aired episodes, the calendars only
 * unaired ones, and film releases only ever land in Calendar.
 */
export function computeUpNext(inputs: UpNextInputs, now: Date): UpNextData {
  const anilistPairs = inputs.anilist
    .map((input) => ({ input, entry: anilistEntry(input, now) }))
    .filter(
      (pair): pair is { input: AniListUpNextInput; entry: UpNextEntry } =>
        pair.entry != null,
    );
  const anilistEntries = anilistPairs.map((pair) => pair.entry);
  // Both tracker legs, then the cross-tracker collapse (KTD-10): Simkl's row
  // wins over Trakt's for the same show and section, before AniList's own
  // dedupe gets its turn below.
  const episodeEntries = dedupeTrackerEpisodes([
    ...inputs.progress
      .map((input) => progressEntry(input, now))
      .filter((entry): entry is UpNextEntry => entry != null),
    ...inputs.calendar
      .map((input) => calendarEntry(input, now))
      .filter((entry): entry is UpNextEntry => entry != null),
  ]);
  const releaseEntries = inputs.releases.map(releaseEntry);

  // Only *surviving* AniList entries suppress their Trakt twin — an AniList
  // entry that classified to nothing (hiatus, caught up) must not silently
  // take the Trakt card down with it.
  const anilistIdKeys = new Set(
    anilistPairs.flatMap((pair) =>
      identityKeys({
        ...pair.input.item.externalIds,
        ...(pair.input.tmdbId != null ? { tmdb: pair.input.tmdbId } : {}),
      }),
    ),
  );

  const entries = dedupeByTmdb(
    anilistEntries,
    [...episodeEntries, ...releaseEntries],
    anilistIdKeys,
  );

  return {
    // Most recently watched first — the same ordering the pool arrives in, so
    // the show you were last watching sits at the head of the row.
    continueWatching: entries
      .filter((entry) => entry.status === 'aired')
      .sort((a, b) => b.item.lastUpdated.localeCompare(a.item.lastUpdated)),
    // Soonest first, releases and episodes interleaved: Calendar is read as a
    // schedule, not as a library, and a film out on Friday belongs between
    // Thursday's and Saturday's episodes rather than in a group of its own.
    calendar: entries
      .filter((entry) => entry.status === 'upcoming' && inCalendarWindow(entry, now))
      .sort((a, b) => entryOrder(a) - entryOrder(b)),
  };
}
