import type { ProviderId } from '@/lib/providers/types';
import type { ProviderFailure } from '@/state/queries/settle';
import type { NormalizedMediaItem } from '@/types/media';

export interface WatchlistInput {
  item: NormalizedMediaItem;
  source: ProviderId;
  addedAt?: string;
  /** Cached AniList MediaList.id hint; removal guards on a fresh read instead. */
  entryId?: number;
  /** Cached AniList status hint; deleting a CURRENT entry also removes progress, score, and notes. */
  anilistStatus?: 'CURRENT' | 'PLANNING';
  /** Cached Simkl watch-history count hint; Simkl's remove endpoint deletes history alongside plan-to-watch. */
  simklWatchedCount?: number;
}

export interface WatchlistInputs {
  inputs: WatchlistInput[];
  errors: ProviderFailure[];
  /** Legs that succeeded without reading all pages (e.g. paginated Letterboxd scrape), so absence is unknown rather than confirmed. */
  incomplete: ProviderId[];
}

export interface WatchlistEntry {
  id: string;
  item: NormalizedMediaItem;
  sources: ProviderId[];
  sourceIds: string[];
  addedAt?: string;
  anilistStatus?: 'CURRENT' | 'PLANNING';
  simklWatchedCount?: number;
}
