import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
// oxlint-disable-next-line no-restricted-imports -- one composed colour, see the call site.
import { useCSSVariable } from 'uniwind';

import { AnimatedView } from '@/components/animated-view';
import { BlurEnter } from '@/components/blur-enter';
import { ExpandableText } from '@/components/expandable-text';
import { FloatingBackButton } from '@/components/floating-back-button';
import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { haptics } from '@/lib/haptics';
import { DURATION } from '@/lib/motion';
import { PeopleSectionsSkeleton } from '@/features/person/people-section';
import type { NormalizedMediaItem } from '@/types/media';

import { EpisodeLogButton } from '@/features/episode-details/episode-log-button';
import {
  EpisodeCreditsSection,
  EpisodeHeaderSkeleton,
  EpisodeHeading,
  EpisodeLogs,
  EpisodeNav,
  EpisodeOverview,
  EpisodeSeriesLink,
  useGoToEpisode,
} from '@/features/episode-details/episode-sections';
import type { EpisodeRef } from '@/features/episode-details/episode-neighbours';
import { useEpisode } from '@/features/episode-details/use-episode';
import { useEpisodeLogs } from '@/features/episode-details/use-episode-logs';

/** Mirrors index.web.tsx — keep both variants' props identical. */
export interface EpisodeScreenProps {
  item: NormalizedMediaItem;
  season: number;
  number: number;
  onBack: () => void;
}

/** A horizontal drag has to travel this far before it is a swipe, not a scroll wobble. */
const SWIPE_ACTIVATE_PX = 24;
/** A drift this far on the vertical axis first hands the touch to the scroll view. */
const SWIPE_FAIL_Y_PX = 16;
/** Pans that begin this close to the left edge belong to iOS's back gesture. */
const BACK_GESTURE_EDGE_PX = 24;
/** A flick this fast commits regardless of how far the finger got. */
const SWIPE_COMMIT_VELOCITY = 800;
/** A drag past this fraction of the width commits on release. */
const SWIPE_COMMIT_FRACTION = 1 / 3;
/** How much of the finger the page follows at an end with no neighbour. */
const RUBBER_BAND = 0.25;

/**
 * Native (and the tsc default): a full-screen push shaped like the show's
 * own details screen — the still runs full-bleed under the status bar and
 * fades into the page, the heading sits over the fade, the back button floats.
 *
 * A horizontal swipe steps to the neighbouring episode: the page follows the
 * finger on the UI thread, springs back under the threshold, and past it
 * hands the same `replace` the nav buttons fire (`useGoToEpisode`) — the
 * stack's own animation then carries the page out, in the direction the
 * finger was going. An end with no neighbour rubber-bands instead of
 * stopping dead.
 */
export function EpisodeScreen({ item, season, number, onBack }: EpisodeScreenProps) {
  const view = useEpisode(item, season, number);
  const logs = useEpisodeLogs(item, season, number, view.episode?.firstAired);
  const go = useGoToEpisode(item.id, season, number);
  const { width } = useWindowDimensions();
  const drag = useSharedValue(0);
  const { prev, next } = view;
  function step(target: EpisodeRef) {
    haptics.selection();
    go(target);
  }
  const swipe = Gesture.Pan()
    .activeOffsetX([-SWIPE_ACTIVATE_PX, SWIPE_ACTIVATE_PX])
    .failOffsetY([-SWIPE_FAIL_Y_PX, SWIPE_FAIL_Y_PX])
    // Negative hit slop shrinks the area: the left edge stays the stack's.
    .hitSlop({ left: -BACK_GESTURE_EDGE_PX })
    .onUpdate((event) => {
      const target = event.translationX < 0 ? next : prev;
      drag.set(target == null ? event.translationX * RUBBER_BAND : event.translationX);
    })
    .onEnd((event) => {
      const target = event.translationX < 0 ? next : prev;
      const committed =
        target != null &&
        (Math.abs(event.translationX) > width * SWIPE_COMMIT_FRACTION ||
          Math.abs(event.velocityX) > SWIPE_COMMIT_VELOCITY);
      // On commit the offset stays where the finger left it: the replace
      // animation takes over from there rather than from a snap back to 0.
      if (committed) {
        scheduleOnRN(step, target);
        return;
      }
      drag.set(
        withSpring(0, {
          duration: 400,
          dampingRatio: 0.8,
          velocity: event.velocityX,
          reduceMotion: ReduceMotion.System,
        }),
      );
    });
  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.get() }],
  }));
  // `useCSSVariable`, not `useThemeColor`: this colour is *composed* into the
  // gradient's transparent stop (`${background}00`), and web's `var(--token)`
  // cannot be concatenated. The prerender has no DOM to read, so the first
  // page a visitor loads fades to this dark fallback even in the light theme
  // — the scrim sits under a hero image, and it corrects on the next
  // navigation. docs/solutions/web-prerender-bakes-js-resolved-colors.md
  const backgroundVariable = useCSSVariable('--color-background');
  const background =
    typeof backgroundVariable === 'string' ? backgroundVariable : '#0a0a0a';
  const hero = view.still || item.backdropImage || '';

  if (view.episode == null && view.isLoading) {
    return <EpisodeScreenSkeleton onBack={onBack} />;
  }

  return (
    <View className="flex-1 bg-background">
      <GestureDetector gesture={swipe}>
      <AnimatedView className="flex-1" style={dragStyle}>
      <ScrollView className="flex-1">
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

          <View className="px-6 -mt-10 pb-12">
            {view.episode == null ? (
              <Text className="text-muted font-sans">This episode isn’t listed.</Text>
            ) : (
              <>
                <EpisodeHeading
                  episode={view.episode}
                  number={number}
                  rating={view.rating}
                  season={season}
                  showTitle={item.title}
                />
                <EpisodeLogs className="mt-3" logs={logs} />
                <EpisodeLogButton
                  className="mt-5"
                  episode={view.episode}
                  item={item}
                  next={view.next}
                  number={number}
                  season={season}
                  watched={logs.length > 0}
                />
                <EpisodeOverview className="mt-6" episode={view.episode} />
              </>
            )}
            <EpisodeCreditsSection number={number} season={season} tmdbId={view.tmdbId} />
            <EpisodeNav
              className="mt-8"
              id={item.id}
              next={view.next}
              number={number}
              prev={view.prev}
              season={season}
            />
            <EpisodeSeriesLink className="mt-3" id={item.id} />
          </View>
        </BlurEnter>
      </ScrollView>
      </AnimatedView>
      </GestureDetector>

      <FloatingBackButton onPress={onBack} />
    </View>
  );
}

/**
 * The whole screen as placeholders, block for block, so the content blurs in
 * over the same geometry. Rendered by the route while the item resolves and
 * by the screen while the episode loads — one shape for both, so the two
 * phases are indistinguishable. Its `exiting` fade runs over the arriving
 * content: the crossfade Emil's blur bridges, with no timer on this side.
 */
export function EpisodeScreenSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <AnimatedView className="flex-1 bg-background" exiting={FadeOut.duration(DURATION.exit)}>
      <Skeleton className="h-64 w-full" delay={staggerDelay(0)} />
      <View className="px-6 -mt-10 pb-12">
        <EpisodeHeaderSkeleton />
        {/* The log button fills the column here (no `self-start`, unlike web). */}
        <Skeleton className="h-12 w-full rounded-full mt-5" delay={staggerDelay(1)} />
        <ExpandableText.Skeleton className="mt-6" lines={4} />
        <PeopleSectionsSkeleton />
        <View className="flex-row gap-3 mt-8">
          <Skeleton className="flex-1 h-9 rounded-full" delay={staggerDelay(3)} />
          <Skeleton className="flex-1 h-9 rounded-full" delay={staggerDelay(3)} />
        </View>
        <Skeleton className="h-12 w-full rounded-full mt-3" delay={staggerDelay(4)} />
      </View>
      <FloatingBackButton onPress={onBack} />
    </AnimatedView>
  );
}
