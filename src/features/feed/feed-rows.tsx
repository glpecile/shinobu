
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
  useSuspenseYourWatchlistQuery,
} from '@/state/queries/use-unified-feed';
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

export function YourWatchlistRow({
  username,
  onItemPress,
  onItemActions,
}: FeedRowCallbacks & { username: string }) {
  const { data } = useSuspenseYourWatchlistQuery(username);
  const pushRoute = usePushRoute();
  const items = useVisibleItems(data);
  return (
    <MediaCarousel
      collapseKey="your-watchlist"
      items={items}
      onItemActions={onItemActions}
      onItemPress={onItemPress}
      // The row shows page 1 (28 films); the rest of the watchlist lives
      // behind the paginated grid (plan 0024 U9).
      onViewAll={() => pushRoute(routes.letterboxdWatchlist)}
      provider="letterboxd"
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
