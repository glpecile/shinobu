import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import Head from '@/components/head';
import { Platform, type ScrollViewInstance, Text, View } from 'react-native';

import {
  FeedRowSkeleton,
  FeedSkeleton,
  LandscapeRowSkeleton,
  ReadingRowSkeleton,
  UpNextSectionSkeleton,
} from '@/components/feed-skeleton';
import { useBootRevealed } from '@/components/boot-splash/revealed';
import { CollapsibleSection } from '@/components/collapsible-section';
import { homeHeaderClassName, homeHeaderTitleSize } from '@/components/screen-header-spacing';
import { GestureScrollView } from '@/components/animated-view';
import { ConnectTrackerButton } from '@/components/connect-tracker-button';
import { COPY_STAGGER, HeroEnter, HeroProviders } from '@/components/hero-enter';
import { OfflineBanner } from '@/components/offline-banner';
import { SuspenseSection } from '@/components/suspense-section';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import {
  ContinueReadingRow,
  FeedEnd,
  YourWatchlistRow,
  LetterboxdWatchlistRow,
} from '@/features/feed/feed-rows';
import { PosterWall } from '@/features/feed/poster-wall';
import { UpNextSection } from '@/features/up-next/up-next-section';
import { ComingSoonRow } from '@/features/up-next/coming-soon-row';
import {
  HardcoverListsReconnectRow,
  HardcoverListsRow,
  LetterboxdListsRow,
  SerializdListsRow,
  ListsRowSkeleton,
} from '@/features/lists/lists-row';
import { cn } from '@/lib/cn';
import { warmProviderConnections } from '@/lib/http/warm-connections';
import { providersForFeed } from '@/lib/providers/routing';
import { usePushRoute } from '@/lib/navigation';
import { Provider } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import { hasUpNextSources, useRefetchUnifiedFeed } from '@/state/queries/use-unified-feed';
import { continueReadingProviders } from '@/state/queries/continue-reading';
import { usePrefetchMediaDetails } from '@/state/queries/media-details';
import { watchlistReadProviders } from '@/state/queries/watchlist';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { getSerializdUsername } from '@/state/session/serializd';
import { useConnectedProviders, useHardcoverListsGranted } from '@/state/session';
import { useOAuthCallback } from '@/state/session/use-oauth-callback';
import type { NormalizedMediaItem } from '@/types/media';

const WALL_HOVER = Platform.OS === 'web';
function EmptyFeed({ connectFailed }: { connectFailed: boolean }) {
  const revealed = useBootRevealed();

  return (
    <View className="flex-1">
      <PosterWall />
      <GestureScrollView
        className={cn('flex-1', WALL_HOVER && 'pointer-events-none')}
        contentContainerClassName={cn(
          'grow justify-end md:justify-center pt-4',
          WALL_HOVER && 'pointer-events-none',
        )}
      >
        {revealed && (
          <View
            className="w-full max-w-2xl px-6 pb-8 ios:pb-28 md:px-16 md:pb-0"
            // Uniwind has no `pointer-events-auto`; this re-enables the copy under the pass-through.
            style={{ pointerEvents: 'auto' }}
          >
            <HeroEnter className="mb-5">
              <HeroProviders />
            </HeroEnter>
            <HeroEnter delay={COPY_STAGGER}>
              <Text
                accessibilityRole="header"
                className="font-display text-foreground tracking-tight text-4xl md:text-6xl"
              >
                {'One log.\nEvery tracker.'}
              </Text>
            </HeroEnter>
            <HeroEnter className="mt-3 md:mt-5" delay={COPY_STAGGER * 2}>
              <Text className="font-sans text-muted text-base leading-relaxed md:max-w-md">
                Log a movie, show, anime, or manga once across your connected trackers.
              </Text>
            </HeroEnter>
            {connectFailed && (
              <HeroEnter className="mt-4" delay={COPY_STAGGER * 3}>
                <Text className="text-accent font-sans text-sm">
                  Connecting your tracker failed. Please try again.
                </Text>
              </HeroEnter>
            )}
            <HeroEnter className="mt-6" delay={COPY_STAGGER * 4}>
              <ConnectTrackerButton className="self-stretch md:self-start" />
            </HeroEnter>
          </View>
        )}
      </GestureScrollView>
    </View>
  );
}

function FeedScreen() {
  const reduceMotion = useReducedMotion();
  const pushRoute = usePushRoute();
  const prefetchDetails = usePrefetchMediaDetails();
  const connected = useConnectedProviders();
  const feedProviders = providersForFeed(connected);
  useEffect(() => {
    warmProviderConnections(connected);
  }, [connected]);
  const watchlistConnected = watchlistReadProviders(connected).length > 0;
  // Gate on feedProviders (empty on SSR) so MMKV isn't read during web SSR (docs/solutions/expo-web-ssr-mmkv-storage-on-server.md).
  const letterboxdUsername = feedProviders.includes(Provider.Letterboxd)
    ? getLetterboxdUsername()
    : null;
  const serializdUsername = feedProviders.includes(Provider.Serializd)
    ? getSerializdUsername()
    : null;
  const hardcoverListsGranted = useHardcoverListsGranted();
  const upNextConnected = hasUpNextSources(connected);
  const refetchFeed = useRefetchUnifiedFeed();
  const [refreshCount, setRefreshCount] = useState(0);
  const { openActions, sheetProps } = useCardActions();
  const revealed = useBootRevealed();
  const scrollRef = useRef<ScrollViewInstance>(null);

  function openDetails(item: NormalizedMediaItem) {
    prefetchDetails(item);
    pushRoute(routes.details(item.id, item.type));
  }

  async function refresh() {
    await refetchFeed();
    setRefreshCount((count) => count + 1);
  }

  return (
    <View className="flex-1">
      <OfflineBanner />
      <CollapsibleSection.Scroll
        className="flex-1"
        ref={scrollRef}
        contentContainerClassName={
          process.env.EXPO_OS === 'web'
            ? 'pt-2 pb-8 md:pt-6'
            : process.env.EXPO_OS === 'android'
              ? 'pt-2 pb-4'
              : 'pt-2 pb-24'
        }
        onRefresh={refresh}
        tab="index"
      >
        {upNextConnected && (
          <SuspenseSection fallback={<UpNextSectionSkeleton />} resetKey={refreshCount}>
            <UpNextSection onItemActions={openActions} onItemPress={openDetails} />
          </SuspenseSection>
        )}
        {continueReadingProviders(connected).length > 0 && (
          <SuspenseSection fallback={<ReadingRowSkeleton />} resetKey={refreshCount}>
            <ContinueReadingRow onItemActions={openActions} />
          </SuspenseSection>
        )}
        {watchlistConnected && (
          <SuspenseSection fallback={<FeedRowSkeleton hasAction />} resetKey={refreshCount}>
            <YourWatchlistRow onItemActions={openActions} />
          </SuspenseSection>
        )}
        {serializdUsername != null && (
          <SuspenseSection fallback={<LandscapeRowSkeleton />} resetKey={refreshCount}>
            <ComingSoonRow
              onItemActions={openActions}
              onItemPress={openDetails}
              username={serializdUsername}
            />
          </SuspenseSection>
        )}
        {letterboxdUsername != null && (
          <SuspenseSection fallback={<FeedRowSkeleton hasAction />} resetKey={refreshCount}>
            <LetterboxdWatchlistRow onItemActions={openActions} username={letterboxdUsername} />
          </SuspenseSection>
        )}
        {letterboxdUsername != null && (
          <>
            <SuspenseSection fallback={<ListsRowSkeleton />} resetKey={refreshCount}>
              <LetterboxdListsRow kind="created" username={letterboxdUsername} />
            </SuspenseSection>
            <SuspenseSection fallback={<ListsRowSkeleton />} resetKey={refreshCount}>
              <LetterboxdListsRow kind="liked" username={letterboxdUsername} />
            </SuspenseSection>
          </>
        )}
        {serializdUsername != null && (
          <>
            <SuspenseSection fallback={<ListsRowSkeleton />} resetKey={refreshCount}>
              <SerializdListsRow kind="created" username={serializdUsername} />
            </SuspenseSection>
            <SuspenseSection fallback={<ListsRowSkeleton />} resetKey={refreshCount}>
              <SerializdListsRow kind="liked" username={serializdUsername} />
            </SuspenseSection>
          </>
        )}
        {connected.includes(Provider.Hardcover) &&
          (hardcoverListsGranted ? (
            <>
              <SuspenseSection fallback={<ListsRowSkeleton />} resetKey={refreshCount}>
                <HardcoverListsRow kind="created" />
              </SuspenseSection>
              <SuspenseSection fallback={<ListsRowSkeleton />} resetKey={refreshCount}>
                <HardcoverListsRow kind="liked" />
              </SuspenseSection>
            </>
          ) : (
            <HardcoverListsReconnectRow />
          ))}
        <FeedEnd onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: !reduceMotion })} />
      </CollapsibleSection.Scroll>
      {revealed && <CardActionsSheet {...sheetProps} />}
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
          content="Log a movie, show, anime, or manga once across your connected trackers with Shinobu."
          name="description"
        />
      </Head>
      <View className={cn(homeHeaderClassName, process.env.EXPO_OS === 'web' && 'md:hidden')}>
        <Text className={cn(homeHeaderTitleSize, 'font-display text-foreground tracking-tight')}>
          忍 Shinobu
        </Text>
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
    </View>
  );
}
