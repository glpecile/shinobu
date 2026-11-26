import type { QueryClient } from '@tanstack/react-query';

import { hasAired, parseLocalInstant } from '@/lib/time/has-aired';
import { Provider, type ProviderId } from '@/lib/providers/types';
import { anilistMediaKind } from '@/lib/providers/routing';
import { anilistQueryKeys } from '@/state/queries/anilist';
import { hardcoverQueryKeys } from '@/state/queries/hardcover';
import { letterboxdQueryKeys } from '@/state/queries/letterboxd';
import { serializdQueryKeys } from '@/state/queries/serializd';
import { simklQueryKeys } from '@/state/queries/simkl';
import { traktQueryKeys } from '@/state/queries/trakt';
import { upNextQueryKeys } from '@/state/queries/up-next';
import { watchlistQueryKeys } from '@/state/queries/watchlist';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { getSerializdUsername } from '@/state/session/serializd';
import type { NormalizedMediaItem } from '@/types/media';

export function invalidateAfterWatchlist(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
  succeeded: readonly ProviderId[],
) {
  if (succeeded.includes(Provider.Trakt)) {
    queryClient.invalidateQueries({ queryKey: traktQueryKeys.myCalendarRoot() });
    queryClient.invalidateQueries({ queryKey: traktQueryKeys.watchlistRoot() });
  }
  if (succeeded.includes(Provider.AniList)) {
    if (item.externalIds.anilist != null)
      queryClient.invalidateQueries({
        queryKey: anilistQueryKeys.relations(item.externalIds.anilist),
      });
    queryClient.invalidateQueries({
      queryKey:
        anilistMediaKind(item) === 'MANGA'
          ? anilistQueryKeys.currentMangaEntries()
          : anilistQueryKeys.currentAnimeEntries(),
    });
    const mediaId = item.externalIds.anilist;
    if (mediaId != null) {
      queryClient.invalidateQueries({ queryKey: anilistQueryKeys.entryState(mediaId) });
    }
  }
  if (succeeded.includes(Provider.Letterboxd)) {
    const username = getLetterboxdUsername();
    if (username != null) {
      queryClient.invalidateQueries({ queryKey: letterboxdQueryKeys.watchlist(username) });
      queryClient.invalidateQueries({
        queryKey: letterboxdQueryKeys.watchlistPages(username),
      });
    }
  }
  if (succeeded.includes(Provider.Serializd)) {
    const username = getSerializdUsername();
    const tmdbId = item.externalIds.tmdb;
    if (username != null && tmdbId != null) {
      queryClient.invalidateQueries({
        queryKey: serializdQueryKeys.progress(username, tmdbId),
      });
    }
  }
  if (succeeded.includes(Provider.Simkl)) {
    queryClient.invalidateQueries({ queryKey: simklQueryKeys.allItemsRoot() });
    queryClient.invalidateQueries({ queryKey: simklQueryKeys.activities() });
  }
  if (succeeded.includes(Provider.Hardcover)) {
    queryClient.invalidateQueries({ queryKey: hardcoverQueryKeys.libraryRoot() });
  }
  if (succeeded.length > 0) {
    queryClient.invalidateQueries({ queryKey: upNextQueryKeys.inputs() });
    queryClient.invalidateQueries({ queryKey: watchlistQueryKeys.inputs() });
  }
}

const NOTIFICATION_WINDOW_DAYS = 7;
const NOTIFICATION_WINDOW_MS = NOTIFICATION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

function itemInstants(item: NormalizedMediaItem): string[] {
  return [
    item.releaseDate,
    item.releaseCalendar?.theatrical,
    item.releaseCalendar?.digital,
    item.releaseCalendar?.physical,
  ].filter((value): value is string => value != null && value !== '');
}

export function shouldRefreshNotifications(
  item: NormalizedMediaItem,
  platform: string,
  now: Date = new Date(),
): boolean {
  if (platform === 'web') return false;
  const horizon = now.getTime() + NOTIFICATION_WINDOW_MS;
  return itemInstants(item).some((value) => {
    if (hasAired(value, now)) return false;
    const instant = parseLocalInstant(value);
    return instant != null && instant.getTime() <= horizon;
  });
}
