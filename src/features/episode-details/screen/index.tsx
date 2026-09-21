import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { FadeOut, useReducedMotion } from 'react-native-reanimated';
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
import { ProviderLinksSection } from '@/features/provider-links/provider-links-section';
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
  EpisodeStep,
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

/** How far off a page boundary a resting offset may sit. */
const BOUNDARY_TOLERANCE = 2;

/**
 * Native (and the tsc default): a full-screen push shaped like the show's
 * own details screen — the still runs full-bleed under the status bar and
 * fades into the page, the heading sits over the fade, the back button floats.
 *
 * Episodes are horizontal pages of a native paging scroll view
 * (`features/anime-seasons/season-pager.tsx` is the pattern): the swipe, its
 * velocity and the rubber-band at either end are the platform's. Every episode
 * of the sequence owns the slot at `index * width`, but only the settled one
 * and its neighbours are mounted — the rest is two spacers, so a mounted page
 * never moves when the window does. The URL follows the pager with
 * `setParams`: one screen instance, so back still returns to the show.
 */
export function EpisodeScreen({ item, season, number, onBack }: EpisodeScreenProps) {
  const view = useEpisode(item, season, number);
  if (view.isLoading || view.orderLoading) {
    return <EpisodeScreenSkeleton onBack={onBack} />;
  }
  return (
    <EpisodePager item={item} number={number} onBack={onBack} order={view.order} season={season} />
  );
}

/** Mounted once the order is known, so `settled` starts on the opened episode. */
function EpisodePager({
  item,
  season,
  number,
  onBack,
  order: fullOrder,
}: EpisodeScreenProps & { order: EpisodeRef[] }) {
  const router = useRouter();
  const scroller = useRef<ScrollView>(null);
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
  // The page the scroll last rested on: what the mounted window is centred on
  // and where `contentOffset` points. Not `index` — that moves when a button
  // step starts, and a changed `contentOffset` would cut its scroll short.
  const [settled, setSettled] = useState(index);

  function commit(target: EpisodeRef) {
    router.setParams({ season: String(target.season), number: String(target.number) });
  }

  function settleAt(x: number) {
    const page = Math.round(x / width);
    if (Math.abs(x - page * width) > BOUNDARY_TOLERANCE) return;
    const landed = order[page];
    if (landed == null) return;
    setSettled(page);
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
    if (reduceMotion) setSettled(page);
    commit(target);
  }

  const first = Math.max(Math.min(settled - 1, index), 0);
  const last = Math.min(Math.max(settled + 1, index), order.length - 1);

  return (
    <View
      className="flex-1 bg-background"
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
    >
      <EpisodeStep value={step}>
        <ScrollView
          contentOffset={{ x: settled * width, y: 0 }}
          horizontal
          onMomentumScrollEnd={(event) => settleAt(event.nativeEvent.contentOffset.x)}
          pagingEnabled
          ref={scroller}
          showsHorizontalScrollIndicator={false}
        >
          <View style={{ width: first * width }} />
          {order.slice(first, last + 1).map((entry) => (
            <View key={`${entry.season}-${entry.number}`} style={{ width, height }}>
              <EpisodePage item={item} number={entry.number} season={entry.season} />
            </View>
          ))}
          <View style={{ width: (order.length - 1 - last) * width }} />
        </ScrollView>
      </EpisodeStep>
      <FloatingBackButton onPress={onBack} />
    </View>
  );
}

/**
 * One episode's page: its own reads, so a neighbour is complete before the
 * swipe reveals it.
 */
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

  return (
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
          <EpisodeNav className="mt-8" id={item.id} next={view.next} prev={view.prev} />
          <EpisodeSeriesLink className="mt-3" id={item.id} />
          <ProviderLinksSection episode={{ season, number }} item={item} />
        </View>
      </BlurEnter>
    </ScrollView>
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
