import { useTraktShowProgressQuery } from '@/state/queries/trakt';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';
import {
  nextEpisodeFromProgress,
  type SeriesNextEpisode,
} from './series-next-episode';

/**
 * `unavailable` is "we can't name the next episode", not "there is none":
 * Trakt disconnected, the item carries no Trakt id, or the progress read
 * failed. Callers fall back to the season picker on the details page.
 */
export type SeriesNextEpisodeState =
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'ready'; episode: SeriesNextEpisode };

/**
 * The next unwatched episode of a TV series, from Trakt's own watched-progress
 * read (`next_episode`). This is the TV counterpart of the anime path's
 * "next episode" derivation, so a series gets the same one-tap log affordance
 * an anime series has instead of a pointer to the details page.
 *
 * Accepts `null` so the card-actions sheet — whose item is nulled between
 * openings — can call it unconditionally.
 */
export function useSeriesNextEpisode(
  item: NormalizedMediaItem | null,
): SeriesNextEpisodeState {
  const connected = useConnectedProviders();
  const traktConnected = connected.includes('trakt');
  const traktId = item?.type === 'TV' ? item.externalIds.trakt : undefined;
  const progress = useTraktShowProgressQuery({
    traktId,
    enabled: traktConnected,
  });

  if (!traktConnected || traktId == null) return { status: 'unavailable' };
  if (progress.isError) return { status: 'unavailable' };
  if (progress.data == null) return { status: 'loading' };

  return { status: 'ready', episode: nextEpisodeFromProgress(progress.data) };
}
