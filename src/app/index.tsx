import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import Head from '@/components/head';
import {
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { AnimatedView } from '@/components/animated-view';
import { FeedSkeleton, FeedSkeletonOverlay } from '@/components/feed-skeleton';
import { MediaCarousel } from '@/components/media-carousel';
import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { RefreshableScrollView } from '@/components/refreshable-scroll-view';
import {
  homeHeaderClassName,
  homeHeaderTitleSize,
} from '@/components/screen-header-spacing';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { haptics } from '@/lib/haptics';
import { animeSeasonLabel } from '@/lib/providers/anilist/season';
import { routes } from '@/lib/routes';
import { useUnifiedFeed } from '@/state/queries/use-unified-feed';
import { useConnectedProviders } from '@/state/session';
import { useOAuthCallback } from '@/state/session/use-oauth-callback';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * One corner tile of the empty-state hero. Bobs gently up and down on a
 * staggered loop so the provider marks feel alive; rotation stays constant
 * inside the animated transform (an outer static transform would be replaced
 * wholesale by the animated one).
 */
function FloatingTile({
  children,
  delay,
  rotate,
  style,
}: {
  children: React.ReactNode;
  delay: number;
  rotate: string;
  style?: StyleProp<ViewStyle>;
}) {
  const bob = useSharedValue(0);

  useEffect(() => {
    bob.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
  }, [bob, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(bob.value, [0, 1], [-5, 5]) },
      { rotate },
    ],
  }));

  return (
    <AnimatedView
      className="absolute bg-surface border border-border rounded-2xl items-center justify-center"
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedView>
  );
}

function EmptyFeed({ connectFailed }: { connectFailed: boolean }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 640;
  const tile = compact ? 56 : 72;
  const icon = compact ? 28 : 36;
  // Wide screens pull the tiles in toward the headline; narrow screens keep
  // them near the edges so they never crowd the copy.
  const inset = compact ? '7%' : '20%';

  return (
    <View className="flex-1 items-center justify-center px-8">
      {/* Floating provider marks — the trackers Shinobu fans out to. The
          fourth corner carries the 忍 brand mark. On narrow screens the
          centered copy occupies the middle band, so the tiles retreat to the
          genuinely empty regions: just under the header and just above the
          bottom edge. */}
      <FloatingTile
        delay={0}
        rotate="-8deg"
        style={{ top: compact ? '6%' : '22%', left: inset, width: tile, height: tile }}
      >
        <ProviderIcon id="trakt" size={icon} />
      </FloatingTile>
      <FloatingTile
        delay={650}
        rotate="7deg"
        style={{ top: compact ? '12%' : '26%', right: inset, width: tile, height: tile }}
      >
        <ProviderIcon id="anilist" size={icon} />
      </FloatingTile>
      <FloatingTile
        delay={1300}
        rotate="6deg"
        style={{ bottom: compact ? '10%' : '24%', left: inset, width: tile, height: tile }}
      >
        <ProviderIcon id="letterboxd" size={icon} />
      </FloatingTile>
      <FloatingTile
        delay={1950}
        rotate="-6deg"
        style={{ bottom: compact ? '5%' : '20%', right: inset, width: tile, height: tile }}
      >
        <Text className="text-accent" style={{ fontSize: icon }}>
          忍
        </Text>
      </FloatingTile>

      <Text
        className={`${compact ? 'text-4xl' : 'text-6xl'} font-display text-foreground tracking-tight text-center`}
      >
        One log.{'\n'}Every tracker.
      </Text>
      <Text
        className={`text-base font-sans text-muted mt-5 text-center leading-relaxed ${compact ? 'max-w-xs' : 'max-w-md'}`}
      >
        Shinobu is a harness for your media logging platforms — log a movie,
        show, or manga once and it fans out to Trakt, AniList, and Letterboxd.
      </Text>
      {connectFailed && (
        <Text className="text-accent font-sans text-sm mt-4 text-center">
          Connecting your tracker failed. Please try again.
        </Text>
      )}
      {/* Same accent button as the connect rows on Manage Trackers. */}
      <PresstableOpacity
        className="bg-accent px-8 py-3 rounded mt-10"
        onPress={() => router.push(routes.connect)}
      >
        <Text className="text-accent-foreground font-sans-semibold text-base text-center">
          Connect your trackers
        </Text>
      </PresstableOpacity>
      <Text className="text-muted font-sans text-xs mt-5 text-center">
        No Shinobu account — your provider tokens never leave this device.
      </Text>
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
    yourWatchlist,
    isLoading,
    isError,
    refetch,
  } = useUnifiedFeed();
  const router = useRouter();
  // The single actions dialog behind every card's long-press / web ⋯ button.
  // Item is kept through close so content doesn't vanish mid-animation.
  const [actionsItem, setActionsItem] = useState<NormalizedMediaItem | null>(
    null,
  );
  const [actionsOpen, setActionsOpen] = useState(false);

  function openDetails(item: NormalizedMediaItem) {
    router.push(routes.details(item.id));
  }

  function openActions(item: NormalizedMediaItem) {
    haptics.selection();
    setActionsItem(item);
    setActionsOpen(true);
  }

  const hasData =
    trendingMovies.length > 0 ||
    trendingShows.length > 0 ||
    seasonalAnime.length > 0 ||
    yourShows.length > 0 ||
    yourAnime.length > 0 ||
    yourWatchlist.length > 0;

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
          collapseKey="your-shows"
          provider="trakt"
          items={yourShows}
          onItemPress={openDetails}
          onItemActions={openActions}
        />
        <MediaCarousel
          title="Your Anime"
          collapseKey="your-anime"
          provider="anilist"
          items={yourAnime}
          onItemPress={openDetails}
          onItemActions={openActions}
        />
        <MediaCarousel
          title="Your Watchlist"
          collapseKey="your-watchlist"
          provider="letterboxd"
          items={yourWatchlist}
          onItemPress={openDetails}
          onItemActions={openActions}
        />
        <MediaCarousel
          title="Trending Movies"
          collapseKey="trending-movies"
          provider="trakt"
          items={trendingMovies}
          onItemPress={openDetails}
          onItemActions={openActions}
        />
        <MediaCarousel
          title="Trending TV Shows"
          collapseKey="trending-shows"
          provider="trakt"
          items={trendingShows}
          onItemPress={openDetails}
          onItemActions={openActions}
        />
        <MediaCarousel
          title={`${animeSeasonLabel(animeSeason)} Anime`}
          collapseKey="seasonal-anime"
          provider="anilist"
          items={seasonalAnime}
          onItemPress={openDetails}
          onItemActions={openActions}
        />
      </RefreshableScrollView>
      <FeedSkeletonOverlay visible={isLoading && !hasData} />
      <CardActionsSheet
        item={actionsItem}
        onClose={() => setActionsOpen(false)}
        open={actionsOpen}
      />
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
          content="Shinobu is a harness for your media logging platforms — log once and it fans out to Trakt, AniList, and Letterboxd."
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
