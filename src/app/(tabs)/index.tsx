import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import Head from '@/components/head';
import {
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { EmptyStateTile } from '@/components/empty-state-tile';
import {
  FeedRowSkeleton,
  FeedSkeleton,
  UpNextSectionSkeleton,
} from '@/components/feed-skeleton';
import { FloatingTile } from '@/components/floating-tile';
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
import { UpNextSection } from '@/features/up-next/up-next-section';
import { animeSeasonAt } from '@/lib/providers/anilist/season';
import { providersForFeed } from '@/lib/providers/routing';
import { routes } from '@/lib/routes';
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
        style={{ top: compact ? '4%' : '22%', left: inset, width: tile, height: tile }}
      >
        <ProviderIcon id="trakt" size={icon} />
      </FloatingTile>
      <FloatingTile
        delay={650}
        rotate="7deg"
        style={{ top: compact ? '10%' : '26%', right: inset, width: tile, height: tile }}
      >
        <ProviderIcon id="anilist" size={icon} />
      </FloatingTile>
      <FloatingTile
        delay={1300}
        rotate="6deg"
        style={{
          bottom: compact ? '16%' : '24%',
          // Nudged further left than the shared inset on web only.
          left: compact ? inset : '14%',
          width: tile,
          height: tile,
        }}
      >
        <ProviderIcon id="letterboxd" size={icon} />
      </FloatingTile>
      <FloatingTile
        delay={1950}
        rotate="-6deg"
        style={{ bottom: compact ? '15%' : '20%', right: inset, width: tile, height: tile }}
      >
        <Text className="text-accent" style={{ fontSize: icon }}>
          忍
        </Text>
      </FloatingTile>

      {/* The headline/copy/CTA is the shared empty-state tile (hero size); the
          floating provider marks above and the account note below stay as
          Home-specific chrome around it. */}
      <EmptyStateTile
        cta={{
          label: 'Connect your trackers',
          onPress: () => router.push(routes.connect),
        }}
        description="Shinobu is a harness for your media trackers — log a movie, show, or anime once and every one you've connected stays in sync."
        size="hero"
        title={`One log.\nEvery tracker.`}
      >
        {connectFailed && (
          <Text className="text-accent font-sans text-sm mt-4 text-center">
            Connecting your tracker failed. Please try again.
          </Text>
        )}
      </EmptyStateTile>
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
  // The `feedProviders` gate also keeps this MMKV read out of web SSR renders
  // (empty in the server snapshot — docs/solutions/expo-web-ssr-mmkv-storage-on-server.md).
  const letterboxdUsername = feedProviders.includes('letterboxd')
    ? getLetterboxdUsername()
    : null;
  const animeSeason = animeSeasonAt(new Date());
  // Up Next is computed from Trakt shows and AniList anime only — with neither
  // connected there is nothing to compute, so the sections never mount.
  const upNextConnected =
    feedProviders.includes('trakt') || feedProviders.includes('anilist');
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
        // Web has no header (sidebar owns brand) so it needs top breathing room;
        // native clears the bottom tab bar, whose height can't be measured.
        contentContainerClassName={
          process.env.EXPO_OS === 'web' ? 'pt-6 pb-8' : 'pt-2 pb-24'
        }
        onRefresh={refresh}
      >
        {/* What to watch next, above everything the user merely tracks. */}
        {upNextConnected && (
          <SuspenseSection
            fallback={<UpNextSectionSkeleton />}
            resetKey={refreshCount}
          >
            <UpNextSection
              onItemActions={openActions}
              onItemPress={openDetails}
            />
          </SuspenseSection>
        )}
        {/* Personal rows first (2026-07-14 re-prioritization), trending after.
            Watchlist leads the personal block, seasonal leads the public one
            (owner ordering, 2026-07-23). Every row is its own suspense + error
            boundary: one provider failing hides just that row, never the feed. */}
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
        <SuspenseSection fallback={<FeedRowSkeleton />} resetKey={refreshCount}>
          <SeasonalAnimeRow
            onItemActions={openActions}
            onItemPress={openDetails}
            season={animeSeason}
          />
        </SuspenseSection>
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
      </RefreshableScrollView>
      <CardActionsSheet {...sheetProps} />
    </View>
  );
}

export default function App() {
  const connected = useConnectedProviders();
  const oauthStatus = useOAuthCallback();

  return (
    <View className="flex-1 bg-background">
      <Head>
        <title>Shinobu</title>
        <meta
          content="Shinobu is a harness for your media trackers. Log a movie, show, or anime once and every one you've connected stays in sync."
          name="description"
        />
      </Head>
      {/* The tab bar (native) / sidebar (web) now own navigation, so the header
          is brand-only. On web the sidebar already carries the 忍 mark, so this
          duplicate title is dropped there. */}
      {process.env.EXPO_OS !== 'web' && (
        <View className={homeHeaderClassName}>
          {/* No connection status here (2026-07-14) — that lives on Manage Trackers. */}
          <Text
            className={`${homeHeaderTitleSize} font-display text-foreground tracking-tight`}
          >
            忍 Shinobu
          </Text>
        </View>
      )}

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
