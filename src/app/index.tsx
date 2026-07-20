import Ionicons from '@react-native-vector-icons/ionicons/static';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import Head from '@/components/head';
import {
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useCSSVariable } from 'uniwind';

import { FeedRowSkeleton, FeedSkeleton } from '@/components/feed-skeleton';
import { FloatingTile } from '@/components/floating-tile';
import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { RefreshableScrollView } from '@/components/refreshable-scroll-view';
import {
  homeHeaderClassName,
  homeHeaderTitleSize,
} from '@/components/screen-header-spacing';
import { SuspenseSection } from '@/components/suspense-section';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import {
  SeasonalAnimeRow,
  TrendingMoviesRow,
  TrendingShowsRow,
  YourAnimeRow,
  YourShowsRow,
  YourWatchlistRow,
} from '@/features/feed/feed-rows';
import { animeSeasonAt } from '@/lib/providers/anilist/season';
import { providersForFeed } from '@/lib/providers/routing';
import { routes } from '@/lib/routes';
import { letterboxdReadsAvailable } from '@/state/queries/letterboxd';
import { useRefetchUnifiedFeed } from '@/state/queries/use-unified-feed';
import { useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { useOAuthCallback } from '@/state/session/use-oauth-callback';
import type { NormalizedMediaItem } from '@/types/media';

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
        Shinobu is a harness for your media trackers — log a movie, show, or
        anime once and every one you&apos;ve connected stays in sync.
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
  const router = useRouter();
  const connected = useConnectedProviders();
  const feedProviders = providersForFeed(connected);
  // The platform gate also keeps this MMKV read out of web SSR renders
  // (docs/solutions/expo-web-ssr-mmkv-storage-on-server.md).
  const letterboxdUsername =
    feedProviders.includes('letterboxd') && letterboxdReadsAvailable()
      ? getLetterboxdUsername()
      : null;
  const animeSeason = animeSeasonAt(new Date());
  const refetchFeed = useRefetchUnifiedFeed();
  // Bumped on pull-to-refresh so failed (boundary-hidden) rows re-attempt.
  const [refreshCount, setRefreshCount] = useState(0);
  // The single actions dialog behind every card's long-press / web ⋯ button.
  const { openActions, sheetProps } = useCardActions();

  function openDetails(item: NormalizedMediaItem) {
    router.push(routes.details(item.id));
  }

  async function refresh() {
    await refetchFeed();
    setRefreshCount((count) => count + 1);
  }

  return (
    <View className="flex-1">
      <RefreshableScrollView
        className="flex-1"
        contentContainerClassName="pt-2 pb-8"
        onRefresh={refresh}
      >
        {/* Personal rows first (2026-07-14 re-prioritization), trending after.
            Every row is its own suspense + error boundary: one provider
            failing hides just that row, never the whole feed. */}
        {feedProviders.includes('trakt') && (
          <SuspenseSection
            fallback={<FeedRowSkeleton />}
            resetKey={refreshCount}
          >
            <YourShowsRow
              onItemActions={openActions}
              onItemPress={openDetails}
            />
          </SuspenseSection>
        )}
        {feedProviders.includes('anilist') && (
          <SuspenseSection
            fallback={<FeedRowSkeleton />}
            resetKey={refreshCount}
          >
            <YourAnimeRow
              onItemActions={openActions}
              onItemPress={openDetails}
            />
          </SuspenseSection>
        )}
        {letterboxdUsername != null && (
          <SuspenseSection
            fallback={<FeedRowSkeleton />}
            resetKey={refreshCount}
          >
            <YourWatchlistRow
              onItemActions={openActions}
              onItemPress={openDetails}
              username={letterboxdUsername}
            />
          </SuspenseSection>
        )}
        <SuspenseSection fallback={<FeedRowSkeleton />} resetKey={refreshCount}>
          <TrendingMoviesRow
            onItemActions={openActions}
            onItemPress={openDetails}
          />
        </SuspenseSection>
        <SuspenseSection fallback={<FeedRowSkeleton />} resetKey={refreshCount}>
          <TrendingShowsRow
            onItemActions={openActions}
            onItemPress={openDetails}
          />
        </SuspenseSection>
        <SuspenseSection fallback={<FeedRowSkeleton />} resetKey={refreshCount}>
          <SeasonalAnimeRow
            onItemActions={openActions}
            onItemPress={openDetails}
            season={animeSeason}
          />
        </SuspenseSection>
      </RefreshableScrollView>
      <CardActionsSheet {...sheetProps} />
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
          content="Shinobu is a harness for your media trackers. Log a movie, show, or anime once and every one you've connected stays in sync."
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
