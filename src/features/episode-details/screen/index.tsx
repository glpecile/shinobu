import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, Text, View } from 'react-native';
// oxlint-disable-next-line no-restricted-imports -- one composed colour, see the call site.
import { useCSSVariable } from 'uniwind';

import { BlurEnter } from '@/components/blur-enter';
import { FloatingBackButton } from '@/components/floating-back-button';
import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { Skeleton, staggerDelay } from '@/components/skeleton';
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
              view.isLoading ? (
                <EpisodeHeaderSkeleton />
              ) : (
                <Text className="text-muted font-sans">This episode isn’t listed.</Text>
              )
            ) : (
              <BlurEnter>
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
              </BlurEnter>
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

/** Mirrors the loaded layout so content lands without a shift; delays run top-down. */
export function EpisodeScreenSkeleton() {
  return (
    <View className="flex-1 bg-background">
      <Skeleton className="h-64 w-full" delay={staggerDelay(0)} />
      <View className="px-6 -mt-10">
        <Skeleton className="h-3 w-32 rounded" delay={staggerDelay(1)} />
        <Skeleton className="h-8 w-64 rounded mt-2" delay={staggerDelay(1)} />
        <Skeleton className="h-3 w-40 rounded mt-2" delay={staggerDelay(1)} />
        <Skeleton className="h-11 w-44 rounded-full mt-5" delay={staggerDelay(2)} />
        <Skeleton className="h-4 w-full rounded mt-6" delay={staggerDelay(3)} />
        <Skeleton className="h-4 w-2/3 rounded mt-2" delay={staggerDelay(3)} />
      </View>
    </View>
  );
}
