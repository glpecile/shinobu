import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';

import Head from '@/components/head';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { FeedSkeleton, FeedSkeletonOverlay } from '@/components/feed-skeleton';
import { MediaCarousel } from '@/components/media-carousel';
import { PresstableOpacity } from '@/components/presstable';
import { RefreshableScrollView } from '@/components/refreshable-scroll-view';
import {
  homeHeaderClassName,
  homeHeaderTitleSize,
} from '@/components/screen-header-spacing';
import { animeSeasonLabel } from '@/lib/providers/anilist/season';
import { routes } from '@/lib/routes';
import { useUnifiedFeed } from '@/state/queries/use-unified-feed';
import { useConnectedProviders } from '@/state/session';
import { useOAuthCallback } from '@/state/session/use-oauth-callback';
import type { NormalizedMediaItem } from '@/types/media';

function EmptyFeed({ connectFailed }: { connectFailed: boolean }) {
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center px-8 -mt-16">
      <Text className="text-5xl font-display text-foreground mb-3 text-center">
        忍
      </Text>
      <Text className="text-2xl font-display text-foreground text-center">
        Connect your trackers
      </Text>
      <Text className="text-base font-sans text-muted mt-3 text-center max-w-xs leading-relaxed">
        Choose the providers you use. Your feed appears as soon as you connect
        the first one.
      </Text>
      {connectFailed && (
        <Text className="text-accent font-sans text-sm mt-4 text-center">
          Connecting your tracker failed. Please try again.
        </Text>
      )}
      <PresstableOpacity
        className="bg-accent px-8 py-3 rounded mt-8"
        onPress={() => router.push(routes.connect)}
      >
        <Text className="text-accent-foreground font-sans-semibold text-base">
          Get started
        </Text>
      </PresstableOpacity>
    </View>
  );
}

function FeedScreen() {
  const {
    trendingMovies,
    trendingShows,
    seasonalAnime,
    animeSeason,
    yourShows,
    yourAnime,
    isLoading,
    isError,
    refetch,
  } = useUnifiedFeed();
  const router = useRouter();

  function openDetails(item: NormalizedMediaItem) {
    router.push(routes.details(item.id));
  }

  const hasData =
    trendingMovies.length > 0 ||
    trendingShows.length > 0 ||
    seasonalAnime.length > 0 ||
    yourShows.length > 0 ||
    yourAnime.length > 0;

  if (isError && !isLoading && !hasData) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-accent font-sans text-center text-base">
          Could not load your feed.
        </Text>
        <Text className="text-muted font-sans text-center mt-2 text-sm">
          Pull to refresh or check your connection.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <RefreshableScrollView
        className="flex-1"
        contentContainerClassName="pt-2 pb-8"
        onRefresh={refetch}
      >
        {isError && (
          <Text className="text-muted font-sans text-xs px-4 pb-2">
            Some content could not be loaded.
          </Text>
        )}
        {/* Personal rows first (2026-07-14 re-prioritization), trending after. */}
        <MediaCarousel
          title="Your Shows"
          provider="trakt"
          items={yourShows}
          onItemPress={openDetails}
        />
        <MediaCarousel
          title="Your Anime"
          provider="anilist"
          items={yourAnime}
          onItemPress={openDetails}
        />
        <MediaCarousel
          title="Trending Movies"
          provider="trakt"
          items={trendingMovies}
          onItemPress={openDetails}
        />
        <MediaCarousel
          title="Trending TV Shows"
          provider="trakt"
          items={trendingShows}
          onItemPress={openDetails}
        />
        <MediaCarousel
          title={`${animeSeasonLabel(animeSeason)} Anime`}
          provider="anilist"
          items={seasonalAnime}
          onItemPress={openDetails}
        />
      </RefreshableScrollView>
      <FeedSkeletonOverlay visible={isLoading && !hasData} />
    </View>
  );
}

export default function App() {
  const connected = useConnectedProviders();
  const oauthStatus = useOAuthCallback();
  const router = useRouter();
  const foreground = useCSSVariable('--color-foreground');

  return (
    <View className="flex-1 bg-background">
      <Head>
        <title>Shinobu</title>
        <meta
          content="Log a movie, show, or manga once — Shinobu fans it out to every tracker you've connected."
          name="description"
        />
      </Head>
      <View className={homeHeaderClassName}>
        {/* No connection status here (2026-07-14) — that lives on Manage Trackers. */}
        <Text className={`${homeHeaderTitleSize} font-display text-foreground tracking-tight`}>
          忍 Shinobu
        </Text>
        <View className="flex-row gap-3">
          <PresstableOpacity
            accessibilityLabel="Search"
            className="w-10 h-10 items-center justify-center rounded-full bg-surface border border-border"
            onPress={() => router.push(routes.search)}
          >
            <Ionicons
              color={typeof foreground === 'string' ? foreground : undefined}
              name="search-outline"
              size={20}
            />
          </PresstableOpacity>
          <PresstableOpacity
            accessibilityLabel="Manage trackers"
            className="w-10 h-10 items-center justify-center rounded-full bg-surface border border-border"
            onPress={() => router.push(routes.connect)}
          >
            <Ionicons
              color={typeof foreground === 'string' ? foreground : undefined}
              name="settings-outline"
              size={20}
            />
          </PresstableOpacity>
        </View>
      </View>

      {connected.length === 0 ? (
        oauthStatus === 'exchanging' ? (
          <FeedSkeleton />
        ) : (
          <EmptyFeed connectFailed={oauthStatus === 'error'} />
        )
      ) : (
        <FeedScreen />
      )}

      <StatusBar style="auto" />
    </View>
  );
}
