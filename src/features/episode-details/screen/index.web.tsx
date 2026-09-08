import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { FloatingBackButton } from '@/components/floating-back-button';
import Head from '@/components/head';
import { cn } from '@/lib/cn';
import type { NormalizedMediaItem } from '@/types/media';

import {
  EpisodeCreditsSection,
  EpisodeHeaderSkeleton,
  EpisodeHeading,
  EpisodeLogs,
  EpisodeOverview,
  EpisodeStill,
} from '@/features/episode-details/episode-sections';
import { useEpisode } from '@/features/episode-details/use-episode';
import { useEpisodeLogs } from '@/features/episode-details/use-episode-logs';

/** Mirrors index.tsx — keep the three variants' props identical. */
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
        <View className="w-full max-w-4xl self-center px-6 pt-24 pb-12">
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
                <>
                  <EpisodeHeading
                    episode={view.episode}
                    number={number}
                    rating={view.rating}
                    season={season}
                    showTitle={item.title}
                  />
                  <EpisodeLogs className="mt-3" logs={logs} />
                  <View className="mt-5">
                    <EpisodeOverview episode={view.episode} />
                  </View>
                </>
              )}
            </View>
          </View>
          <EpisodeCreditsSection number={number} season={season} tmdbId={view.tmdbId} />
        </View>
      </ScrollView>

      <FloatingBackButton onPress={onBack} />
    </View>
  );
}
