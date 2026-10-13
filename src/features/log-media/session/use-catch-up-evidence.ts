import type { UpNextEpisodeEntry } from '@/features/up-next/types';
import { useSeasonLayoutQuery } from '@/state/queries/mapping';
import { useSimklLibraryEntryQuery } from '@/state/queries/simkl';
import { useTraktShowProgressQuery } from '@/state/queries/trakt';

import type { CatchUpEvidence } from './queue';

export type CatchUpEvidenceState =
  | { status: 'loading' }
  | { status: 'ready'; evidence: CatchUpEvidence };

/**
 * The reads `catchUpQueue` needs for this entry's source, and nothing more
 * (plan 0037 KTD-2): an entry one episode behind reads nothing; a Trakt entry
 * reads its progress (already cached by the Up Next gather); a Simkl entry its
 * library row (the cached snapshot) and, for TV, the season layout the anime
 * fan-out already caches. A read that fails is `ready` with nothing — the
 * queue degrades to the entry alone, never to a guess.
 */
export function useCatchUpEvidence(entry: UpNextEpisodeEntry): CatchUpEvidenceState {
  const chainable = (entry.episodesBehind ?? 1) > 1;
  const { source, item } = entry;
  const traktId = item.externalIds.trakt;

  const progress = useTraktShowProgressQuery({
    traktId,
    enabled: chainable && source === 'trakt',
  });
  const simklEntry = useSimklLibraryEntryQuery({
    item,
    enabled: chainable && source === 'simkl',
  });
  // Trakt only needs a layout when its cached progress predates `airedEpisodes`.
  const traktNeedsLayout =
    source === 'trakt' && progress.data != null && progress.data.airedEpisodes == null;
  const needsLayout =
    chainable &&
    entry.episode.season != null &&
    (source === 'simkl' || traktNeedsLayout);
  const layout = useSeasonLayoutQuery({
    tmdb: needsLayout ? item.externalIds.tmdb : undefined,
    trakt: needsLayout ? traktId : undefined,
  });

  if (!chainable) return { status: 'ready', evidence: {} };

  if (source === 'trakt') {
    if (traktId != null && progress.data == null && !progress.isError) {
      return { status: 'loading' };
    }
    if (needsLayout && layout.data === undefined && !layout.isError) {
      return { status: 'loading' };
    }
    return {
      status: 'ready',
      evidence: { trakt: progress.data ?? null, layout: layout.data ?? null },
    };
  }

  if (source === 'simkl') {
    // `undefined` is "snapshot not loaded"; a loaded snapshot without this
    // show selects to `null`.
    if (simklEntry.data === undefined && !simklEntry.isError) {
      return { status: 'loading' };
    }
    if (needsLayout && layout.data === undefined && !layout.isError) {
      return { status: 'loading' };
    }
    return {
      status: 'ready',
      evidence: { simkl: simklEntry.data ?? null, layout: layout.data ?? null },
    };
  }

  // AniList: `episodesBehind` is exact (plan 0019 KTD-3), no read needed.
  return { status: 'ready', evidence: {} };
}
