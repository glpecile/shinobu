import type { QueryClient } from '@tanstack/react-query';

import {
  runWatchlistRemove,
  watchlistRemoveDeps,
  type WatchlistRemoveDeps,
} from '@/features/watchlist-media/use-unwatchlist-media';
import { findWatchlistRemoval } from '@/features/watchlist/find-watchlist-removal';
import type { ProviderId } from '@/lib/providers/types';
import { watchlistQueryKeys, type WatchlistInputs } from '@/state/queries/watchlist';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * A watched film leaves the watchlist (plan 0033 U7, owner decision
 * 2026-07-30): once a **film-like** log lands somewhere, the item is removed
 * from every watchlist that holds it, through the same removal verb the picker
 * fires — same routing, same per-provider guards (AniList's R36 fresh-read
 * guard sees the just-logged COMPLETED entry and skips rather than deleting
 * it; a Trakt copy the server already auto-removed reports `deleted: 0` as a
 * harmless skip; Letterboxd's state set is an idempotent 204 either way).
 *
 * **Movies only.** A TV log deliberately does not trigger this — one episode
 * watched does not mean the show stops being "to watch", so shows are removed
 * manually (the same reasoning as Trakt's own show/season caveat in
 * `invalidateAfterLog`). `isFilm` anime route as films, exactly like the log
 * fan-out itself.
 *
 * **Best-effort, cache-only discovery, never a surface.** Membership comes
 * from the gathered watchlist cache (`findWatchlistRemoval` — a cold cache is
 * a no-op, never a fetch, per `useIsWatchlisted`'s discipline), and the
 * removal's report is deliberately discarded: this is a derived write the
 * user didn't aim, so its failure must not fail the log, reopen the sheet, or
 * block the toast. A film that stays on the list because the removal failed
 * is visible on the next gather and removable by hand — a recoverable state,
 * unlike a log report polluted with outcomes the user never asked about.
 */
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

  try {
    await runWatchlistRemove(
      queryClient,
      removal.entry,
      connected,
      removal.errors,
      {},
      deps,
      removal.incomplete,
    );
  } catch {
    // Best-effort by contract (docblock) — including the "nothing at all can
    // be offered" throw, which for a derived write is just "nothing to do".
  }
}
