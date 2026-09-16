import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, Text, View } from 'react-native';
import { FadeOut } from 'react-native-reanimated';
// oxlint-disable-next-line no-restricted-imports -- one composed colour, see the call site.
import { useCSSVariable } from 'uniwind';

import { AnimatedView } from '@/components/animated-view';
import { BlurEnter } from '@/components/blur-enter';
import { FloatingBackButton } from '@/components/floating-back-button';
import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { Skeleton, staggerDelay } from '@/components/skeleton';
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
} from '@/features/episode-details/episode-sections';
import { useEpisode } from '@/features/episode-details/use-episode';
import { useEpisodeLogs } from '@/features/episode-details/use-episode-logs';

/** Mirrors index.web.tsx — keep both variants' props identical. */
export interface EpisodeScreenProps {
  item: NormalizedMediaItem;
  season: number;
  number: number;
  onBack: () => void;
}

/**
 * Native (and the tsc default): a full-screen push shaped like the show's
 * own details screen — the still runs full-bleed under the status bar and
 * fades into the page, the heading sits over the fade, the back button floats.
 */
export function EpisodeScreen({ item, season, number, onBack }: EpisodeScreenProps) {
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

  if (view.episode == null && view.isLoading) {
    return <EpisodeScreenSkeleton onBack={onBack} />;
  }

  return (
    <View className="flex-1 bg-background">
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
                  number={number}
                  season={season}
                  watched={logs.length > 0}
                />
                <View className="mt-6">
                  <EpisodeOverview episode={view.episode} />
                </View>
              </>
            )}
            <EpisodeCreditsSection number={number} season={season} tmdbId={view.tmdbId} />
            <EpisodeNav className="mt-8" id={item.id} next={view.next} prev={view.prev} />
            <EpisodeSeriesLink className="mt-3" id={item.id} />
          </View>
        </BlurEnter>
      </ScrollView>

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
        <Skeleton className="h-12 w-44 rounded-full mt-5" delay={staggerDelay(1)} />
        <Skeleton className="h-4 w-full rounded mt-6" delay={staggerDelay(2)} />
        <Skeleton className="h-4 w-full rounded mt-2" delay={staggerDelay(2)} />
        <Skeleton className="h-4 w-2/3 rounded mt-2" delay={staggerDelay(2)} />
        <PeopleSectionsSkeleton />
        <View className="flex-row gap-3 mt-8">
          <Skeleton className="flex-1 h-10 rounded-full" delay={staggerDelay(3)} />
          <Skeleton className="flex-1 h-10 rounded-full" delay={staggerDelay(3)} />
        </View>
        <Skeleton className="h-12 w-full rounded-full mt-3" delay={staggerDelay(4)} />
      </View>
      <FloatingBackButton onPress={onBack} />
    </AnimatedView>
  );
}
