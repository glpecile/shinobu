import type { QueryClient } from '@tanstack/react-query';

import {
  runWatchlistRemove,
  watchlistRemoveDeps,
  type WatchlistRemoveDeps,
} from '@/features/watchlist-media/use-unwatchlist-media';
import { findWatchlistRemoval } from '@/features/watchlist/find-watchlist-removal';
import { Provider, type ProviderId } from '@/lib/providers/types';
import { watchlistQueryKeys, type WatchlistInputs } from '@/state/queries/watchlist';
import type { NormalizedMediaItem } from '@/types/media';

export async function removeWatchedFromWatchlist(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
  connected: readonly ProviderId[],
  deps: WatchlistRemoveDeps = watchlistRemoveDeps(),
): Promise<void> {
  const isFilmLike =
    item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
  if (!isFilmLike) return;

  const data = queryClient.getQueryData<WatchlistInputs>(
    watchlistQueryKeys.inputs(),
  );
  if (data == null) return;
  const removal = findWatchlistRemoval(data, item);
  if (removal == null) return;

  // Exclude Simkl: logging already moved the film out of `plantowatch`, and
  // `/sync/history/remove` deletes watch history while colliding with Simkl's
  // ~20s write lock (docs/solutions/simkl-rate-limits-and-write-lock.md).
  const providers = removal.entry.sources.filter((id) => id !== Provider.Simkl);
  if (providers.length === 0) return;

  try {
    await runWatchlistRemove(
      queryClient,
      removal.entry,
      connected,
      removal.errors,
      { providers },
      deps,
      removal.incomplete,
    );
  } catch {
  }
}
