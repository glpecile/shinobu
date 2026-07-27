import type { AniListCurrentEntry } from '@/lib/providers/anilist/normalize';
import type {
  TraktCalendarEpisode,
  TraktNextEpisode,
} from '@/lib/providers/trakt/normalize';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * The Up Next data contract (plan 0019). Both home sections — Continue
 * Watching and Calendar — are the same entry shape split by whether the
 * episode has aired in the user's local timezone; nothing downstream
 * re-derives that.
 */

/** The single next unwatched episode of one tracked show. */
export interface UpNextEpisode {
  /**
   * The canonical season, when the source knows one — Trakt's pointer does.
   * **Absent for AniList entries** (plan 0027): an AniList entry counts its own
   * episodes 1..n and carries no canonical season, so `number` is
   * entry-relative and the log fan-out translates it via ani.zip. The old
   * `season: 1` literal here was the fabrication that wrote phantom season-1
   * history for every sequel-season anime.
   */
  season?: number;
  number: number;
  title?: string;
  /** ISO air instant. Absent when the source provider exposes none. */
  firstAired?: string;
  /** Minutes, when the provider carried one. */
  runtime?: number;
}

/** One dated release of a film, as the provider's calendars state it. */
export interface UpNextRelease {
  /** Which release this row is — each gets its own labelled entry (R3). */
  kind: 'theatrical' | 'digital' | 'physical';
  /**
   * Bare `YYYY-MM-DD`: a release is a calendar day, not an instant. `lib/time`
   * reads it as *local* midnight (so it buckets on the user's day) and
   * `isDateOnly` keeps it from rendering a 00:00 time nobody stated.
   */
  date: string;
}

interface UpNextEntryBase {
  /** Stable list key: item id + episode or release, so an advance re-keys the row. */
  id: string;
  item: NormalizedMediaItem;
  /** `aired` → Continue Watching, `upcoming` → Calendar. Never both (R3). */
  status: 'aired' | 'upcoming';
  /**
   * The provider whose data produced this entry. The quick-log card advances
   * only when *this* provider's write succeeded — a failed source write can't
   * produce new data to advance from (R8).
   */
  source: ProviderId;
}

/** The next unwatched episode of a tracked show — quick-loggable once aired. */
export interface UpNextEpisodeEntry extends UpNextEntryBase {
  kind: 'episode';
  episode: UpNextEpisode;
}

/** A film release date: no episode to log, and none to fabricate. */
export interface UpNextReleaseEntry extends UpNextEntryBase {
  kind: 'release';
  release: UpNextRelease;
}

/**
 * Discriminated on `kind` rather than an optional `episode` (KTD-1): the
 * discriminant makes an unhandled arm a compile error, where an optional field
 * would only scatter null checks that nothing forces a consumer to write. Read
 * the two arms through `entryInstant`/`entryLabel` (`./entry`) rather than
 * re-deriving them per call site.
 */
export type UpNextEntry = UpNextEpisodeEntry | UpNextReleaseEntry;

export interface UpNextData {
  /** Aired and waiting — quick-loggable. */
  continueWatching: UpNextEntry[];
  /** Airing within the local 7-day window (today … today+6). */
  calendar: UpNextEntry[];
}

/**
 * One pooled Trakt show plus its `next_episode` pointer (undefined = ended).
 * Continue Watching's only Trakt source since KTD-2 — it is the sole read that
 * can answer "your next *unwatched* episode", which the calendars cannot.
 */
export interface TraktUpNextInput {
  item: NormalizedMediaItem;
  nextEpisode?: TraktNextEpisode;
}

/**
 * One upcoming airing from `/calendars/my/shows` — Calendar's Trakt source
 * since KTD-2. A different question from `TraktUpNextInput`: "what airs this
 * week for a show you watch *or* watchlist", not "what you haven't seen yet".
 * That is why it feeds only the upcoming split and never Continue Watching
 * (R4) — a watchlisted show's airing is not something you can quick-log.
 */
export type TraktCalendarUpNextInput = TraktCalendarEpisode;

/**
 * One dated film release, as a provider's calendar stated it. Carries its own
 * `source` because more than one provider feeds this array (Trakt's movie
 * calendars now, Letterboxd's resolved watchlist next) and nothing downstream
 * can re-derive which one a row came from.
 */
export interface ReleaseUpNextInput {
  item: NormalizedMediaItem;
  /** Which release this is — one input per kind, never one row that moves (R3). */
  kind: UpNextRelease['kind'];
  /** Bare `YYYY-MM-DD`, for the reason `UpNextRelease.date` spells out. */
  date: string;
  source: ProviderId;
}

/**
 * One currently-watching AniList entry, optionally carrying the TMDB id the
 * query layer resolved via ani.zip — the dedupe key against Trakt (R5).
 * Best-effort: absent means the entry simply can't be deduped.
 */
export interface AniListUpNextInput extends AniListCurrentEntry {
  tmdbId?: number;
}

export interface UpNextInputs {
  /** Pooled `next_episode` pointers — Continue Watching's source (KTD-2). */
  trakt: TraktUpNextInput[];
  /** This week's Trakt airings — Calendar's source (KTD-2). */
  traktCalendar: TraktCalendarUpNextInput[];
  /** Dated film releases from every watchlist source, one per kind (R3). */
  releases: ReleaseUpNextInput[];
  anilist: AniListUpNextInput[];
  /** Providers whose inputs failed — surfaced, never silently empty (R4). */
  errors: Array<{ provider: ProviderId; message: string }>;
}
