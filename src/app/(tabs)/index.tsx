import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

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
import { cn } from '@/lib/cn';
import { warmProviderConnections } from '@/lib/http/warm-connections';
import { animeSeasonAt } from '@/lib/providers/anilist/season';
import { providersForFeed } from '@/lib/providers/routing';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { useRefetchUnifiedFeed } from '@/state/queries/use-unified-feed';
import { useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { useOAuthCallback } from '@/state/session/use-oauth-callback';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * The four provider marks decorating the zero-providers hero — one per tracker
 * Shinobu writes to. `position` is the wide-viewport absolute placement (the
 * corners around the centred copy); compact viewports ignore it and lay the
 * tiles out in a row above the copy instead — see `EmptyFeed`.
 */
const EMPTY_HERO_TILES = [
  { delay: 0, id: 'trakt', position: { left: '20%', top: '22%' }, rotate: '-8deg' },
  { delay: 650, id: 'anilist', position: { right: '20%', top: '26%' }, rotate: '7deg' },
  // Nudged further left than the shared 20% inset.
  { delay: 1300, id: 'letterboxd', position: { bottom: '24%', left: '14%' }, rotate: '6deg' },
  { delay: 1950, id: 'serializd', position: { bottom: '20%', right: '20%' }, rotate: '-6deg' },
] as const;

function EmptyFeed({ connectFailed }: { connectFailed: boolean }) {
  const pushRoute = usePushRoute();
  const { width } = useWindowDimensions();
  const compact = width < 640;
  const tile = compact ? 56 : 72;
  const icon = compact ? 28 : 36;

  return (
    // No horizontal padding here: `EmptyStateTile` brings its own `px-8`, and
    // stacking the two halved the width the CTA's label had to lay out in.
    <View className="flex-1 items-center justify-center">
      {/* Percentage offsets can't guarantee clearance at phone heights — the
          centred copy fills the middle band and the tiles were painting over
          the headline, the CTA, and the account note. So compact drops the
          absolute placement entirely and puts the marks in normal flow above
          the copy; only wide viewports keep the floating corners. */}
      {compact ? (
        <View className="flex-row items-center justify-center gap-2 mb-6">
          {EMPTY_HERO_TILES.map((mark) => (
            <FloatingTile
              delay={mark.delay}
              floating={false}
              key={mark.id}
              rotate={mark.rotate}
              style={{ width: tile, height: tile }}
            >
              <ProviderIcon id={mark.id} size={icon} />
            </FloatingTile>
          ))}
        </View>
      ) : (
        EMPTY_HERO_TILES.map((mark) => (
          <FloatingTile
            delay={mark.delay}
            key={mark.id}
            rotate={mark.rotate}
            style={{ ...mark.position, width: tile, height: tile }}
          >
            <ProviderIcon id={mark.id} size={icon} />
          </FloatingTile>
        ))
      )}

      {/* The headline/copy/CTA is the shared empty-state tile (hero size); the
          floating provider marks above and the account note below stay as
          Home-specific chrome around it. */}
      <EmptyStateTile
        cta={{
          label: 'Connect your trackers',
          onPress: () => pushRoute(routes.connect),
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
      <Text className="text-muted font-sans text-xs mt-5 px-8 text-center">
        No Shinobu account — your provider tokens never leave this device.
      </Text>
    </View>
  );
}

function FeedScreen() {
  const pushRoute = usePushRoute();
  const connected = useConnectedProviders();
  const feedProviders = providersForFeed(connected);
  // Warm each provider host's connection pool as the feed mounts — a beat ahead
  // of the Up Next request waterfall, so its first reads skip the cold
  // handshake. Native-only (no-op on web); self-guarded to run once.
  useEffect(() => {
    warmProviderConnections(connected);
  }, [connected]);
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
    pushRoute(routes.details(item.id));
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
            className={cn(
              homeHeaderTitleSize,
              'font-display text-foreground tracking-tight',
            )}
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
