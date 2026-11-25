import type { AniListCurrentEntry } from '@/lib/providers/anilist/normalize';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

export type UpNextFinale = 'midseason' | 'season' | 'series';

export interface UpNextEpisode {
  /** Absent for AniList (entry-relative 1..n, mapped via ani.zip) and Simkl anime (absolute AniDB numbering). */
  season?: number;
  number: number;
  title?: string;
  /** ISO air instant. */
  firstAired?: string;
  /** Minutes. */
  runtime?: number;
  finale?: UpNextFinale;
}

export interface UpNextRelease {
  kind: 'theatrical' | 'digital' | 'physical';
  /** Bare `YYYY-MM-DD`, parsed as local midnight by `lib/time` (no time badge). */
  date: string;
}

interface UpNextEntryBase {
  id: string;
  item: NormalizedMediaItem;
  status: 'aired' | 'upcoming';
  source: ProviderId;
  /** Item ids of deduped provider copies folded into this entry. */
  twinIds?: string[];
}

export interface UpNextEpisodeEntry extends UpNextEntryBase {
  kind: 'episode';
  episode: UpNextEpisode;
  /** Aired-but-unwatched count including this episode (≥ 1 when present on an aired entry). */
  episodesBehind?: number;
}

export interface UpNextReleaseEntry extends UpNextEntryBase {
  kind: 'release';
  release: UpNextRelease;
}

export type UpNextEntry = UpNextEpisodeEntry | UpNextReleaseEntry;

export interface UpNextData {
  continueWatching: UpNextEntry[];
  /** Airing within the local 7-day window (today … today+6). */
  calendar: UpNextEntry[];
}

export interface UpNextPointer {
  /** Absent for Simkl anime (absolute AniDB numbering). */
  season?: number;
  number: number;
  title?: string;
  /** ISO air instant, or `null` when the air date is unknown. */
  firstAired: string | null;
  /** Minutes. */
  runtime?: number;
}

export interface ProgressUpNextInput {
  item: NormalizedMediaItem;
  source: ProviderId;
  nextEpisode?: UpNextPointer;
  /** True when provider episode counts prove a null-date pointer has already aired (Simkl). */
  nextEpisodeAiredByCount?: boolean;
  episodesBehind?: number;
}

export interface CalendarUpNextInput {
  item: NormalizedMediaItem;
  source: ProviderId;
  episode: UpNextPointer;
  finale?: UpNextFinale;
}

export interface ReleaseUpNextInput {
  item: NormalizedMediaItem;
  kind: UpNextRelease['kind'];
  /** Bare `YYYY-MM-DD`. */
  date: string;
  source: ProviderId;
}

export interface AniListUpNextInput extends AniListCurrentEntry {
  tmdbId?: number;
}

export interface UpNextInputs {
  progress: ProgressUpNextInput[];
  calendar: CalendarUpNextInput[];
  releases: ReleaseUpNextInput[];
  anilist: AniListUpNextInput[];
  errors: Array<{ provider: ProviderId; message: string }>;
}
