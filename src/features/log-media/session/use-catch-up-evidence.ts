import type { UpNextEpisodeEntry } from '@/features/up-next/types';
import { Provider } from '@/lib/providers/types';
import { useSeasonLayoutQuery } from '@/state/queries/mapping';
import { useSimklLibraryEntryQuery } from '@/state/queries/simkl';
import { useTraktShowProgressQuery } from '@/state/queries/trakt';

import type { CatchUpEvidence } from './queue';

export type CatchUpEvidenceState =
  { status: 'loading' } | { status: 'ready'; evidence: CatchUpEvidence };

export function useCatchUpEvidence(entry: UpNextEpisodeEntry): CatchUpEvidenceState {
  const chainable = (entry.episodesBehind ?? 1) > 1;
  const { source, item } = entry;
  const traktId = item.externalIds.trakt;

  const progress = useTraktShowProgressQuery({
    traktId,
    enabled: chainable && source === Provider.Trakt,
  });
  const simklEntry = useSimklLibraryEntryQuery({
    item,
    enabled: chainable && source === Provider.Simkl,
  });
  const traktNeedsLayout =
    source === Provider.Trakt && progress.data != null && progress.data.airedEpisodes == null;
  const needsLayout =
    chainable && entry.episode.season != null && (source === Provider.Simkl || traktNeedsLayout);
  const layout = useSeasonLayoutQuery({
    tmdb: needsLayout ? item.externalIds.tmdb : undefined,
    trakt: needsLayout ? traktId : undefined,
  });

  if (!chainable) return { status: 'ready', evidence: {} };

  if (source === Provider.Trakt) {
    if (traktId != null && progress.data == null && !progress.isError && !progress.isPaused) {
      return { status: 'loading' };
    }
    if (needsLayout && layout.data === undefined && !layout.isError && !layout.isPaused) {
      return { status: 'loading' };
    }
    return {
      status: 'ready',
      evidence: { trakt: progress.data ?? null, layout: layout.data ?? null },
    };
  }

  if (source === Provider.Simkl) {
    if (simklEntry.data === undefined && !simklEntry.isError && !simklEntry.isPaused) {
      return { status: 'loading' };
    }
    if (needsLayout && layout.data === undefined && !layout.isError && !layout.isPaused) {
      return { status: 'loading' };
    }
    return {
      status: 'ready',
      evidence: { simkl: simklEntry.data ?? null, layout: layout.data ?? null },
    };
  }

  return { status: 'ready', evidence: {} };
}
