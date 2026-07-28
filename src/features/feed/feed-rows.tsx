
import { MediaCarousel } from '@/components/media-carousel';
import {
  animeSeasonLabel,
  type AnimeSeasonWindow,
} from '@/lib/providers/anilist/season';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { useVisibleItems } from '@/state/prefs/hidden-items';
import { capFeedRow } from './row-cap';
import {
  useSuspenseSeasonalAnimeQuery,
  useSuspenseTrendingMoviesQuery,
  useSuspenseTrendingShowsQuery,
  useSuspenseYourAnimeQuery,
  useSuspenseYourShowsQuery,
} from '@/state/queries/use-unified-feed';
import { useSuspenseWatchlistQuery } from '@/features/watchlist/use-watchlist-entries';
import type { NormalizedMediaItem } from '@/types/media';

interface FeedRowCallbacks {
  onItemPress: (item: NormalizedMediaItem) => void;
  onItemActions: (item: NormalizedMediaItem) => void;
}

/**
 * The home feed rows, one per feed slot. Each is a self-contained suspense
 * section (AGENTS.md "Loading & Error States"): it owns its query, applies
 * the hidden-items filter, and is mounted by the screen under its own
 * `SuspenseSection` — one provider failing or loading slowly never blocks or
 * blanks the rows around it.
 */

export function YourShowsRow({ onItemPress, onItemActions }: FeedRowCallbacks) {
  const { data } = useSuspenseYourShowsQuery();
  // The one row whose source is unbounded (`/sync/watched/shows` pages to the
  // whole library) — capped here rather than in the query, because the details
  // screen resolves items by id out of that same cache entry.
  const items = capFeedRow(useVisibleItems(data));
  return (
    <MediaCarousel
      collapseKey="your-shows"
      items={items}
      onItemActions={onItemActions}
      onItemPress={onItemPress}
      provider="trakt"
      title="Your Shows"
    />
  );
}

export function YourAnimeRow({ onItemPress, onItemActions }: FeedRowCallbacks) {
  const { data } = useSuspenseYourAnimeQuery();
  const items = useVisibleItems(data);
  return (
    <MediaCarousel
      collapseKey="your-anime"
      items={items}
      onItemActions={onItemActions}
      onItemPress={onItemPress}
      provider="anilist"
      title="Your Anime"
    />
  );
}

/**
 * The one row whose source is **every** connected provider's watchlist, merged
 * (plan 0031 R25). No `provider` mark and no `username`: it is no longer
 * Letterboxd's row, which is also why a Trakt-only or AniList-only user finally
 * sees it. Its single `SuspenseSection` is unchanged and still correct — one
 * row is one slot; the merged *grid*'s per-leg failure handling is the
 * divergence, and it lives on the screen (KTD-12).
 */
export function YourWatchlistRow({
  onItemPress,
  onItemActions,
}: FeedRowCallbacks) {
  const { entries } = useSuspenseWatchlistQuery();
  const pushRoute = usePushRoute();
  // Capped like the other unbounded personal row: a Trakt watchlist is
  // routinely hundreds of items and this is browse, not the archive — the
  // whole list is one "View all" away.
  const items = capFeedRow(entries.map((entry) => entry.item));
  return (
    <MediaCarousel
      collapseKey="your-watchlist"
      items={items}
      onItemActions={onItemActions}
      onItemPress={onItemPress}
      onViewAll={() => pushRoute(routes.watchlist)}
      title="Your Watchlist"
    />
  );
}

export function TrendingMoviesRow({
  onItemPress,
  onItemActions,
}: FeedRowCallbacks) {
  const { data } = useSuspenseTrendingMoviesQuery();
  const items = useVisibleItems(data);
  return (
    <MediaCarousel
      collapseKey="trending-movies"
      items={items}
      onItemActions={onItemActions}
      onItemPress={onItemPress}
      provider="trakt"
      title="Trending Movies"
    />
  );
}

export function TrendingShowsRow({
  onItemPress,
  onItemActions,
}: FeedRowCallbacks) {
  const { data } = useSuspenseTrendingShowsQuery();
  const items = useVisibleItems(data);
  return (
    <MediaCarousel
      collapseKey="trending-shows"
      items={items}
      onItemActions={onItemActions}
      onItemPress={onItemPress}
      provider="trakt"
      title="Trending TV Shows"
    />
  );
}

export function SeasonalAnimeRow({
  season,
  onItemPress,
  onItemActions,
}: FeedRowCallbacks & { season: AnimeSeasonWindow }) {
  const { data } = useSuspenseSeasonalAnimeQuery(season);
  const items = useVisibleItems(data);
  return (
    <MediaCarousel
      collapseKey="seasonal-anime"
      items={items}
      onItemActions={onItemActions}
      onItemPress={onItemPress}
      provider="anilist"
      title={`${animeSeasonLabel(season)} Anime`}
    />
  );
}
