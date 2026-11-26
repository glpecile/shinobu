import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { CollapsibleSection } from '@/components/collapsible-section';
import { MediaCarousel } from '@/components/media-carousel';
import { ProviderIcon } from '@/components/provider-icon';
import { VirtualizedRail } from '@/components/rail';
import { SectionEnter, useArrivalHistory } from '@/components/section-enter';
import { episodeCardRailHeight } from '@/features/up-next/ui/metrics';
import { haptics } from '@/lib/haptics';
import { animeSeasonLabel, type AnimeSeasonWindow } from '@/lib/providers/anilist/season';
import { usePushRoute } from '@/lib/navigation';
import { Provider } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import { useWindowDimensions } from '@/lib/window-dimensions';
import { useVisibleItems } from '@/state/prefs/hidden-items';
import { useReadingInPages } from '@/state/prefs/reading-unit';
import { useSuspenseContinueReadingQuery } from '@/state/queries/continue-reading';
import { ReadingCard } from './reading-card';
import { capFeedRow } from './row-cap';
import {
  useSuspenseAnimeMoviesQuery,
  useSuspenseSeasonalAnimeQuery,
  useSuspenseTrendingMoviesQuery,
  useSuspenseTrendingShowsQuery,
  useSuspenseYourWatchlistQuery,
} from '@/state/queries/use-unified-feed';
import { useSuspenseWatchlistQuery } from '@/features/watchlist/use-watchlist-entries';
import type { NormalizedMediaItem } from '@/types/media';

interface FeedRowCallbacks {
  onItemActions: (item: NormalizedMediaItem) => void;
}

export function YourWatchlistRow({ onItemActions }: FeedRowCallbacks) {
  const { entries } = useSuspenseWatchlistQuery();
  const pushRoute = usePushRoute();
  const items = capFeedRow(entries.map((entry) => entry.item));
  return (
    <MediaCarousel
      collapseKey="your-watchlist"
      items={items}
      onItemActions={onItemActions}
      leading={<CollapsibleSection.Icon name="bookmark-outline" />}
      onViewAll={() => pushRoute(routes.watchlist())}
      title="Your Watchlist"
    />
  );
}

export function ContinueReadingRow({ onItemActions }: FeedRowCallbacks) {
  const items = capFeedRow(useVisibleItems(useSuspenseContinueReadingQuery()));
  const arrivalHistory = useArrivalHistory(items.map((item) => item.id));
  const { fontScale } = useWindowDimensions();
  const inPages = useReadingInPages();
  if (items.length === 0) return null;
  return (
    <CollapsibleSection
      collapseKey="continue-reading"
      leading={<CollapsibleSection.Icon name="book-outline" />}
      title="Continue Reading"
    >
      <VirtualizedRail
        // Legend List drops horizontal padding on web; spacers match px-4
        // (docs/solutions/legend-list-horizontal-content-padding-web.md).
        ListHeaderComponent={<View className="w-4" />}
        ListFooterComponent={<View className="w-1" />}
        data={items}
        estimatedItemSize={140}
        extraData={inPages}
        keyExtractor={(item) => item.id}
        style={{ height: episodeCardRailHeight(fontScale, 48) }}
        renderItem={({ item }) => (
          <View className="mr-3">
            <SectionEnter arrival={{ id: item.id, seen: arrivalHistory }}>
              <ReadingCard inPages={inPages} item={item} onActionsPress={onItemActions} />
            </SectionEnter>
          </View>
        )}
      />
    </CollapsibleSection>
  );
}

export function LetterboxdWatchlistRow({
  username,
  onItemActions,
}: FeedRowCallbacks & { username: string }) {
  const { data } = useSuspenseYourWatchlistQuery(username);
  const pushRoute = usePushRoute();
  const items = useVisibleItems(data);
  return (
    <MediaCarousel
      collapseKey="letterboxd-watchlist"
      items={items}
      onItemActions={onItemActions}
      onViewAll={() => pushRoute(routes.watchlist(Provider.Letterboxd))}
      leading={<ProviderIcon id={Provider.Letterboxd} size={16} />}
      title="Watchlist"
    />
  );
}

export function TrendingMoviesRow({ onItemActions }: FeedRowCallbacks) {
  const { data } = useSuspenseTrendingMoviesQuery();
  const items = useVisibleItems(data);
  return (
    <MediaCarousel
      collapseKey="trending-movies"
      items={items}
      onItemActions={onItemActions}
      leading={<ProviderIcon id={Provider.Simkl} size={16} />}
      title="Trending Movies"
    />
  );
}

export function TrendingShowsRow({ onItemActions }: FeedRowCallbacks) {
  const { data } = useSuspenseTrendingShowsQuery();
  const items = useVisibleItems(data);
  return (
    <MediaCarousel
      collapseKey="trending-shows"
      items={items}
      onItemActions={onItemActions}
      leading={<ProviderIcon id={Provider.Simkl} size={16} />}
      title="Trending TV Shows"
    />
  );
}

export function SeasonalAnimeRow({
  season,
  onItemActions,
}: FeedRowCallbacks & { season: AnimeSeasonWindow }) {
  const { data } = useSuspenseSeasonalAnimeQuery(season);
  const pushRoute = usePushRoute();
  const items = capFeedRow(useVisibleItems(data));
  return (
    <MediaCarousel
      collapseKey="seasonal-anime"
      items={items}
      onItemActions={onItemActions}
      onViewAll={() => pushRoute(routes.animeSeasons(season, 'TV'))}
      leading={<ProviderIcon id={Provider.AniList} size={16} />}
      title={`Anime of ${animeSeasonLabel(season)}`}
    />
  );
}

export function AnimeMoviesRow({
  season,
  onItemActions,
}: FeedRowCallbacks & { season: AnimeSeasonWindow }) {
  const { data } = useSuspenseAnimeMoviesQuery(season);
  const pushRoute = usePushRoute();
  const items = capFeedRow(useVisibleItems(data));
  return (
    <MediaCarousel
      collapseKey="anime-movies"
      items={items}
      onItemActions={onItemActions}
      onViewAll={() => pushRoute(routes.animeSeasons(season, 'MOVIE'))}
      leading={<ProviderIcon id={Provider.AniList} size={16} />}
      title={`Films of ${animeSeasonLabel(season)}`}
    />
  );
}

export function FeedEnd({ onPress }: { onPress: () => void }) {
  return (
    <View className="items-center gap-3 mt-2 px-4">
      <Text className="text-muted font-sans text-sm">That’s all, folks</Text>
      <Button
        icon={<Button.Icon name="arrow-up" />}
        label="Back to top"
        onPress={() => {
          haptics.selection();
          onPress();
        }}
        size="sm"
        variant="quiet"
      />
    </View>
  );
}
