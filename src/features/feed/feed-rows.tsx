import { MediaCarousel } from '@/components/media-carousel';
import {
  animeSeasonLabel,
  type AnimeSeasonWindow,
} from '@/lib/providers/anilist/season';
import { useVisibleItems } from '@/state/prefs/hidden-items';
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
  const items = useVisibleItems(data);
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
  const items = useVisibleItems(data);
  return (
    <MediaCarousel
      collapseKey="your-watchlist"
      items={items}
      onItemActions={onItemActions}
      onItemPress={onItemPress}
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
