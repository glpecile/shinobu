import type { AniListCurrentEntry } from '@/lib/providers/anilist/normalize';
import type { TraktNextEpisode } from '@/lib/providers/trakt/normalize';
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

export interface UpNextEntry {
  /** Stable list key: item id + episode, so an advance re-keys the row. */
  id: string;
  item: NormalizedMediaItem;
  episode: UpNextEpisode;
  /** `aired` → Continue Watching, `upcoming` → Calendar. Never both (R3). */
  status: 'aired' | 'upcoming';
  /**
   * The provider whose data produced this entry. The quick-log card advances
   * only when *this* provider's write succeeded — a failed source write can't
   * produce new data to advance from (R8).
   */
  source: ProviderId;
}

export interface UpNextData {
  /** Aired and waiting — quick-loggable. */
  continueWatching: UpNextEntry[];
  /** Airing within the local 7-day window (today … today+6). */
  calendar: UpNextEntry[];
}

/** One pooled Trakt show plus its `next_episode` pointer (undefined = ended). */
export interface TraktUpNextInput {
  item: NormalizedMediaItem;
  nextEpisode?: TraktNextEpisode;
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
  trakt: TraktUpNextInput[];
  anilist: AniListUpNextInput[];
  /** Providers whose inputs failed — surfaced, never silently empty (R4). */
  errors: Array<{ provider: ProviderId; message: string }>;
}
