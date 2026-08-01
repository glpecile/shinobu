import { useSimklWatchingEntryQuery } from '@/state/queries/simkl';
import { useTraktShowProgressQuery } from '@/state/queries/trakt';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';
import {
  nextEpisodeFromProgress,
  nextEpisodeFromSimklEntry,
  type SeriesNextEpisode,
} from './series-next-episode';

/**
 * `unavailable` is "we can't name the next episode", not "there is none":
 * no provider that knows this show's progress is connected, or the read
 * failed. Callers fall back to the season picker on the details page.
 */
export type SeriesNextEpisodeState =
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'ready'; episode: SeriesNextEpisode };

/**
 * The next unwatched episode of a TV series — Trakt's watched-progress read
 * (`next_episode`) when Trakt is usable, else Simkl's `watching` snapshot
 * pointer (plan 0034: a Simkl-only user gets the same one-tap log affordance
 * instead of a dead details page). This is the TV counterpart of the anime
 * path's "next episode" derivation.
 *
 * Accepts `null` so the card-actions sheet — whose item is nulled between
 * openings — can call it unconditionally.
 */
export function useSeriesNextEpisode(
  item: NormalizedMediaItem | null,
): SeriesNextEpisodeState {
  const connected = useConnectedProviders();
  const traktConnected = connected.includes('trakt');
  const simklConnected = connected.includes('simkl');
  const isSeries = item?.type === 'TV';
  const traktId = isSeries ? item.externalIds.trakt : undefined;
  const traktUsable = traktConnected && traktId != null;
  const progress = useTraktShowProgressQuery({
    traktId,
    enabled: traktConnected,
  });
  const simklEntry = useSimklWatchingEntryQuery({
    item: isSeries ? item : null,
    enabled: simklConnected && !traktUsable,
  });

  if (item == null || !isSeries) return { status: 'unavailable' };

  if (traktUsable) {
    if (progress.isError) return { status: 'unavailable' };
    if (progress.data == null) return { status: 'loading' };
    return { status: 'ready', episode: nextEpisodeFromProgress(progress.data) };
  }

  if (!simklConnected) return { status: 'unavailable' };
  if (simklEntry.isError) return { status: 'unavailable' };
  // `undefined` is "snapshot not loaded yet"; a loaded snapshot without this
  // show selects to `null`, which the pure derivation handles below.
  if (simklEntry.data === undefined) return { status: 'loading' };
  const episode = nextEpisodeFromSimklEntry(
    { currentProgress: item.currentProgress, totalEpisodes: item.totalEpisodes ?? null },
    simklEntry.data,
  );
  if (episode == null) return { status: 'unavailable' };
  return { status: 'ready', episode };
}
