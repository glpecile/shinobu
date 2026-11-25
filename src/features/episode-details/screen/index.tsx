import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useDeferredValue, useRef, useState } from 'react';
import { Platform, type ScrollViewInstance, Text, View } from 'react-native';
import { useWindowDimensions } from '@/lib/window-dimensions';
import { FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// oxlint-disable-next-line no-restricted-imports -- one composed colour, see the call site.
import { useCSSVariable } from 'uniwind';

import { AnimatedView, GestureScrollView } from '@/components/animated-view';
import { BlurEnter } from '@/components/blur-enter';
import { ExpandableText } from '@/components/expandable-text';
import { FloatingBackButton } from '@/components/floating-back-button';
import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { haptics } from '@/lib/haptics';
import { DURATION } from '@/lib/motion';
import { PeopleSectionsSkeleton } from '@/features/person/people-section';
import { RatingsSection } from '@/features/ratings/ratings-section';
import type { NormalizedMediaItem } from '@/types/media';

import { EpisodeLogButton } from '@/features/episode-details/episode-log-button';
import { DiscussionSection } from '@/features/discussions/discussion-section';
import {
  EpisodeCreditsSection,
  EpisodeHeaderSkeleton,
  EpisodeHeading,
  EpisodeLogs,
  EpisodeNavigation,
  EpisodeOverview,
  EpisodeStep,
} from '@/features/episode-details/episode-sections';
import type { EpisodeRef } from '@/features/episode-details/episode-neighbours';
import { useEpisode } from '@/features/episode-details/use-episode';
import { useEpisodeLogs } from '@/features/episode-details/use-episode-logs';

export interface EpisodeScreenProps {
  item: NormalizedMediaItem;
  season: number;
  number: number;
  onBack: () => void;
}

const BOUNDARY_TOLERANCE = 2;

export function EpisodeScreen({ item, season, number, onBack }: EpisodeScreenProps) {
  const view = useEpisode(item, season, number);
  if (view.isLoading) {
    return <EpisodeScreenSkeleton onBack={onBack} />;
  }
  return (
    <EpisodePager item={item} number={number} onBack={onBack} order={view.order} season={season} />
  );
}

function EpisodePager({
  item,
  season,
  number,
  onBack,
  order: fullOrder,
}: EpisodeScreenProps & { order: EpisodeRef[] }) {
  const router = useRouter();
  const scroller = useRef<ScrollViewInstance>(null);
  const reduceMotion = useReducedMotion();
  const window = useWindowDimensions();
  const { width } = window;
  // A horizontal scroll view does not stretch its pages' height on every platform.
  const [height, setHeight] = useState(window.height);
  const found = fullOrder.findIndex(
    (entry) => entry.season === season && entry.number === number,
  );
  const order = found === -1 ? [{ season, number }] : fullOrder;
  const index = Math.max(found, 0);
  const [settledEpisode, setSettledEpisode] = useState<EpisodeRef>({ season, number });
  const settled = Math.max(
    order.findIndex(
      (entry) => entry.season === settledEpisode.season && entry.number === settledEpisode.number,
    ),
    0,
  );
  const reach = useDeferredValue(1, 0);

  function commit(target: EpisodeRef) {
    router.setParams({ episode: [String(target.season), String(target.number)] });
  }

  function settleAt(x: number) {
    const page = Math.round(x / width);
    if (Math.abs(x - page * width) > BOUNDARY_TOLERANCE) return;
    const landed = order[page];
    if (landed == null) return;
    setSettledEpisode(landed);
    if (page === index) return;
    haptics.selection();
    commit(landed);
  }

  function step(target: EpisodeRef) {
    const page = order.findIndex(
      (entry) => entry.season === target.season && entry.number === target.number,
    );
    if (page === -1) return;
    scroller.current?.scrollTo({ x: page * width, animated: !reduceMotion });
    // A jump fires no momentum event.
    if (reduceMotion) setSettledEpisode(target);
    commit(target);
  }

  const first = Math.max(Math.min(settled - reach, index), 0);
  const last = Math.min(Math.max(settled + reach, index), order.length - 1);

  return (
    <View
      className="flex-1 bg-background"
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
    >
      <EpisodeStep value={step}>
        <GestureScrollView
          contentOffset={{ x: settled * width, y: 0 }}
          horizontal
          // Android applies offsets before layout; mount the expanded content with its offset.
          key={Platform.OS === 'android' && found === -1 ? 'pending' : 'resolved'}
          onMomentumScrollEnd={(event) => settleAt(event.nativeEvent.contentOffset.x)}
          pagingEnabled
          ref={scroller}
          showsHorizontalScrollIndicator={false}
        >
          <View style={{ width: first * width }} />
          {order.slice(first, last + 1).map((entry) => (
            <View
              accessibilityElementsHidden={entry.season !== season || entry.number !== number}
              importantForAccessibility={entry.season === season && entry.number === number ? 'auto' : 'no-hide-descendants'}
              key={`${entry.season}-${entry.number}`}
              style={{ width, height }}
            >
              <EpisodePage item={item} number={entry.number} season={entry.season} />
            </View>
          ))}
          <View style={{ width: (order.length - 1 - last) * width }} />
        </GestureScrollView>
        <EpisodeNavigation id={item.id} next={order[index + 1]} number={number} prev={order[index - 1]} season={season} />
      </EpisodeStep>
      <FloatingBackButton onPress={onBack} />
    </View>
  );
}

function EpisodePage({
  item,
  season,
  number,
}: {
  item: NormalizedMediaItem;
  season: number;
  number: number;
}) {
  const view = useEpisode(item, season, number);
  const logs = useEpisodeLogs(item, season, number, view.episode?.firstAired);
  const insets = useSafeAreaInsets();
  // `useCSSVariable`, not `useThemeColor`: composed into `${background}00`; web's `var(--token)` cannot be concatenated.
  // Fallback handles prerender with no DOM (docs/solutions/web-prerender-bakes-js-resolved-colors.md).
  const backgroundVariable = useCSSVariable('--color-background');
  const background =
    typeof backgroundVariable === 'string' ? backgroundVariable : '#0a0a0a';
  const hero = view.still || item.backdropImage || '';

  return (
    <GestureScrollView className="flex-1" contentContainerStyle={{ paddingBottom: insets.bottom }}>
      <BlurEnter>
        <View className="h-64 relative">
          {hero === '' ? (
            <PosterPlaceholder className="w-full h-full" />
          ) : (
            <Image className="w-full h-full" contentFit="cover" source={{ uri: hero }} />
          )}
          <LinearGradient
            colors={[`${background}00`, background]}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 160 }}
          />
        </View>

        <View className="px-6 -mt-10 pb-44">
          {view.episode == null ? (
            <Text className="text-muted font-sans">This episode isn’t listed.</Text>
          ) : (
            <>
              <EpisodeHeading
                episode={view.episode}
                id={item.id}
                number={number}
                season={season}
                showTitle={item.title}
              />
              <EpisodeLogs className="mt-3" logs={logs} />
              <EpisodeLogButton
                className="mt-5"
                episode={view.episode}
                item={item}
                number={number}
                season={season}
                watched={logs.length > 0}
              />
              <EpisodeOverview className="mt-6" episode={view.episode} />
            </>
          )}
          <EpisodeCreditsSection number={number} season={season} tmdbId={view.tmdbId} />
          <DiscussionSection episode={{ season, number }} item={item} />
          <RatingsSection episode={{ season, number, ratings: view.ratings }} item={item} />
        </View>
      </BlurEnter>
    </GestureScrollView>
  );
}

export function EpisodeScreenSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <AnimatedView className="flex-1 bg-background" exiting={FadeOut.duration(DURATION.exit)}>
      <Skeleton className="h-64 w-full" delay={staggerDelay(0)} />
      <View className="px-6 -mt-10 pb-12">
        <EpisodeHeaderSkeleton />
        <Skeleton className="h-12 w-full rounded-full mt-5" delay={staggerDelay(1)} />
        <ExpandableText.Skeleton className="mt-6" lines={4} />
        <PeopleSectionsSkeleton />
      </View>
      <FloatingBackButton onPress={onBack} />
    </AnimatedView>
  );
}
