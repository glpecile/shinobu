import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { BlurEnter } from '@/components/blur-enter';
import { FloatingBackButton } from '@/components/floating-back-button';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import Head from '@/components/head';
import { cn } from '@/lib/cn';
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
  EpisodeStill,
} from '@/features/episode-details/episode-sections';
import { useEpisode } from '@/features/episode-details/use-episode';
import { useEpisodeLogs } from '@/features/episode-details/use-episode-logs';

/** Mirrors index.tsx — keep both variants' props identical. */
export interface EpisodeScreenProps {
  item: NormalizedMediaItem;
  season: number;
  number: number;
  onBack: () => void;
}

/** Above this the still and the text sit side by side instead of stacked. */
const TWO_COLUMN_MIN_WIDTH = 768;

/**
 * Web: a page inside the sidebar shell. Wide viewports get the still beside
 * the heading and overview (a 16:9 image stacked over text wastes the width
 * a desktop has); narrow ones stack like the native screens. Credits run the
 * full width below either way.
 */
export function EpisodeScreen({ item, season, number, onBack }: EpisodeScreenProps) {
  const view = useEpisode(item, season, number);
  const logs = useEpisodeLogs(item, season, number, view.episode?.firstAired);
  const { width } = useWindowDimensions();
  const wide = width >= TWO_COLUMN_MIN_WIDTH;
  const title = view.episode?.title ?? '';

  return (
    <View className="flex-1 bg-background">
      <Head>
        <title>{`${title === '' ? 'Episode' : title} — ${item.title} — Shinobu`}</title>
        {view.episode?.overview != null && (
          <meta content={view.episode.overview} name="description" />
        )}
      </Head>
      <ScrollView className="flex-1">
        <BlurEnter className="w-full max-w-4xl self-center px-6 pt-24 pb-12">
          <View className={cn(wide && 'flex-row gap-8 items-start')}>
            <EpisodeStill
              className={cn('rounded-card border border-border', wide ? 'flex-1' : 'w-full')}
              title={title}
              uri={view.still}
            />
            <View className={cn('flex-1', !wide && 'mt-5')}>
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
                    className="mt-5 self-start"
                    episode={view.episode}
                    item={item}
                    number={number}
                    season={season}
                    watched={logs.length > 0}
                  />
                  <View className="mt-5">
                    <EpisodeOverview episode={view.episode} />
                  </View>
                </BlurEnter>
              )}
            </View>
          </View>
          <EpisodeCreditsSection number={number} season={season} tmdbId={view.tmdbId} />
          <EpisodeNav className="mt-8" id={item.id} next={view.next} prev={view.prev} />
          <EpisodeSeriesLink className="mt-3" id={item.id} />
        </BlurEnter>
      </ScrollView>

      <FloatingBackButton onPress={onBack} />
    </View>
  );
}

/** Mirrors the loaded layout so content lands without a shift; delays run top-down. */
export function EpisodeScreenSkeleton() {
  const { width } = useWindowDimensions();
  const wide = width >= TWO_COLUMN_MIN_WIDTH;
  return (
    <View className="flex-1 bg-background">
      <View className="w-full max-w-4xl self-center px-6 pt-24">
        <View className={cn(wide && 'flex-row gap-8 items-start')}>
          <Skeleton
            className={cn('aspect-video rounded-card', wide ? 'flex-1' : 'w-full')}
            delay={staggerDelay(0)}
          />
          <View className={cn('flex-1', !wide && 'mt-5')}>
            <Skeleton className="h-3 w-32 rounded" delay={staggerDelay(1)} />
            <Skeleton className="h-8 w-64 rounded mt-2" delay={staggerDelay(1)} />
            <Skeleton className="h-3 w-40 rounded mt-2" delay={staggerDelay(1)} />
            <Skeleton className="h-11 w-44 rounded-full mt-5" delay={staggerDelay(2)} />
            <Skeleton className="h-4 w-full rounded mt-5" delay={staggerDelay(3)} />
            <Skeleton className="h-4 w-2/3 rounded mt-2" delay={staggerDelay(3)} />
          </View>
        </View>
      </View>
    </View>
  );
}
