import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { Button } from '@/components/button';
import Head from '@/components/head';
import {
  type ScrollViewInstance,
  Text,
  View,
} from 'react-native';

import {
  FeedRowSkeleton,
  FeedSkeleton,
  UpNextSectionSkeleton,
} from '@/components/feed-skeleton';
import { ProviderIcon } from '@/components/provider-icon';
import { useBootRevealed } from '@/components/boot-splash/revealed';
import { CollapsibleSection } from '@/components/collapsible-section';
import {
  homeHeaderClassName,
  homeHeaderTitleSize,
} from '@/components/screen-header-spacing';
import { AnimatedView, GestureScrollView } from '@/components/animated-view';
import { heldKeyframes, SectionEnter } from '@/components/section-enter';
import { SuspenseSection } from '@/components/suspense-section';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import {
  FeedEnd,
  YourWatchlistRow,
  LetterboxdWatchlistRow,
} from '@/features/feed/feed-rows';
import { PosterWall } from '@/features/feed/poster-wall';
import { UpNextSection } from '@/features/up-next/up-next-section';
import { LetterboxdListsRow, SerializdListsRow, ListsRowSkeleton } from '@/features/lists/lists-row';
import { cn } from '@/lib/cn';
import { EASE_OUT } from '@/lib/motion';
import { warmProviderConnections } from '@/lib/http/warm-connections';
import { PROVIDERS } from '@/lib/providers/registry';
import { providersForFeed } from '@/lib/providers/routing';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import {
  hasUpNextSources,
  useRefetchUnifiedFeed,
} from '@/state/queries/use-unified-feed';
import { usePrefetchMediaDetails } from '@/state/queries/media-details';
import { watchlistReadProviders } from '@/state/queries/watchlist';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { getSerializdUsername } from '@/state/session/serializd';
import { useConnectedProviders } from '@/state/session';
import { useOAuthCallback } from '@/state/session/use-oauth-callback';
import type { NormalizedMediaItem } from '@/types/media';

const PROVIDER_IDS = Object.values(PROVIDERS).map((provider) => provider.id);
const COPY_STAGGER = 60;
const HERO_ENTER_DURATION = 450;

/** Blur clears as the copy rises; iOS ignores `filter` and keeps the fade and rise. */
const heroEntering = {
  '0%': { opacity: 0, filter: 'blur(4px)', transform: [{ translateY: 8 }] },
  '100%': { opacity: 1, filter: 'blur(0px)', transform: [{ translateY: 0 }] },
};
const heroFading = { '0%': { opacity: 0 }, '100%': { opacity: 1 } };

/** The first-run copy's staggered entrance: longer than `SectionEnter` so the blur reads. */
function HeroEnter({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <AnimatedView
      className={className}
      style={{
        animationName: heldKeyframes(reduceMotion ? heroFading : heroEntering, delay, HERO_ENTER_DURATION),
        animationDuration: HERO_ENTER_DURATION + delay,
        animationTimingFunction: EASE_OUT,
      }}
    >
      {children}
    </AnimatedView>
  );
}

function EmptyFeed({ connectFailed }: { connectFailed: boolean }) {
  const pushRoute = usePushRoute();
  // The copy staggers in once the native splash has faded, not underneath it.
  const revealed = useBootRevealed();

  return (
    <View className="flex-1">
      <PosterWall />
      <GestureScrollView
        className="flex-1"
        contentContainerClassName="grow justify-end md:justify-center pt-4"
      >
        {/* Phones anchor it to the bottom for thumb reach (iOS clears its floating
            tab bar); wide viewports centre it against the wall. */}
        {revealed && (
          <View className="w-full max-w-2xl px-6 pb-8 ios:pb-28 md:px-16 md:pb-0">
            {/* First-run only, so it earns a staggered entrance. */}
            <HeroEnter className="flex-row gap-1.5 mb-5">
              {PROVIDER_IDS.map((id) => (
                <View
                  className="size-8 items-center justify-center rounded-lg bg-surface border border-border"
                  key={id}
                >
                  <ProviderIcon id={id} size={18} />
                </View>
              ))}
            </HeroEnter>
            <HeroEnter delay={COPY_STAGGER}>
              <Text className="font-display text-foreground tracking-tight text-4xl md:text-6xl">
                {'One log.\nEvery tracker.'}
              </Text>
            </HeroEnter>
            <HeroEnter className="mt-3 md:mt-5" delay={COPY_STAGGER * 2}>
              <Text className="font-sans text-muted text-base leading-relaxed md:max-w-md">
                Log a movie, show, anime, or manga once across your connected trackers.
              </Text>
            </HeroEnter>
            {connectFailed && (
              <SectionEnter className="mt-4">
                <Text className="text-accent font-sans text-sm">
                  Connecting your tracker failed. Please try again.
                </Text>
              </SectionEnter>
            )}
            <HeroEnter className="mt-6" delay={COPY_STAGGER * 3}>
              <Button
                className="self-stretch md:self-start"
                icon={<Button.Icon name="link-outline" />}
                label="Connect a tracker"
                onPress={() => pushRoute(routes.settings)}
              />
            </HeroEnter>
          </View>
        )}
      </GestureScrollView>
    </View>
  );
}

function FeedScreen() {
  const pushRoute = usePushRoute();
  const prefetchDetails = usePrefetchMediaDetails();
  const connected = useConnectedProviders();
  const feedProviders = providersForFeed(connected);
  // Warm each provider host's connection pool as the feed mounts — a beat ahead
  // of the Up Next request waterfall, so its first reads skip the cold
  // handshake. Native-only (no-op on web); self-guarded to run once.
  useEffect(() => {
    warmProviderConnections(connected);
  }, [connected]);
  // The merged watchlist row mounts for *any* provider that contributes a
  // watchlist read (plan 0031 R25), so a Trakt-only or AniList-only user — who
  // never had this row — gets one.
  const watchlistConnected = watchlistReadProviders(connected).length > 0;
  // Letterboxd keeps its own films-only row beside it (owner, 2026-07-28). The
  // `feedProviders` gate also keeps this MMKV read out of web SSR renders
  // (empty in the server snapshot — docs/solutions/expo-web-ssr-mmkv-storage-on-server.md).
  const letterboxdUsername = feedProviders.includes('letterboxd')
    ? getLetterboxdUsername()
    : null;
  const serializdUsername = feedProviders.includes('serializd') ? getSerializdUsername() : null;
  // Up Next is computed from Trakt shows, Simkl's library and AniList anime —
  // with none connected there is nothing to compute, so the sections never
  // mount. The predicate lives with the gather it gates (`use-unified-feed.ts`)
  // rather than being re-derived here, which is how Simkl went missing from it.
  const upNextConnected = hasUpNextSources(connected);
  const refetchFeed = useRefetchUnifiedFeed();
  // Bumped on pull-to-refresh so failed (boundary-hidden) rows re-attempt.
  const [refreshCount, setRefreshCount] = useState(0);
  // The single actions dialog behind every card's long-press / web ⋯ button.
  const { openActions, sheetProps } = useCardActions();
  // Its module graph is most of logging; nothing opens it before the reveal.
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
      <CollapsibleSection.Scroll
        className="flex-1"
        ref={scrollRef}
        // Wide web has no header (sidebar owns brand) so it needs top breathing room.
        // Android's tab bar reserves its own space; iOS's floating bar needs clearance.
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
        {/* Each personal row has its own boundary so one failing source
            doesn't hide the others. */}
        {watchlistConnected && (
          <SuspenseSection
            fallback={<FeedRowSkeleton hasAction />}
            resetKey={refreshCount}
          >
            <YourWatchlistRow
              onItemActions={openActions}
            />
          </SuspenseSection>
        )}
        {/* Letterboxd's own row, restored beside the merged one (owner,
            2026-07-28). Its own suspense boundary: a Letterboxd scrape failing
            must not take the merged row down with it, and vice versa. */}
        {letterboxdUsername != null && (
          <SuspenseSection
            fallback={<FeedRowSkeleton hasAction />}
            resetKey={refreshCount}
          >
            <LetterboxdWatchlistRow
              onItemActions={openActions}
              username={letterboxdUsername}
            />
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
        <FeedEnd
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
        />
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
      {/* Brand-only header. From `md` the web sidebar carries the 忍 mark, so
          it's hidden there; a web-only class because native tablets match `md`. */}
      <View
        className={cn(
          homeHeaderClassName,
          process.env.EXPO_OS === 'web' && 'md:hidden',
        )}
      >
        {/* Connection status lives in Settings. */}
        <Text
          className={cn(
            homeHeaderTitleSize,
            'font-display text-foreground tracking-tight',
          )}
        >
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
