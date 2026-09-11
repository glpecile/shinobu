import Ionicons from '@react-native-vector-icons/ionicons/static';
import { ScrollView, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import type { NormalizedMediaItem } from '@/types/media';

import {
  EpisodeCreditsSection,
  EpisodeHeaderSkeleton,
  EpisodeHeading,
  EpisodeLogs,
  EpisodeOverview,
  EpisodeSeriesLink,
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

/**
 * iOS: the route is presented as a native page-sheet modal over the show
 * (`app/_layout.tsx`), so this is sheet content — the still sits inset as a
 * card under the sheet's top edge, nothing runs under the status bar, and the
 * only chrome is a close button (the sheet also dismisses by swiping down).
 */
export function EpisodeScreen({ item, season, number, onBack }: EpisodeScreenProps) {
  const view = useEpisode(item, season, number);
  const logs = useEpisodeLogs(item, season, number, view.episode?.firstAired);
  const foreground = useCSSVariable('--color-foreground');
  const title = view.episode?.title ?? '';

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1">
        <View className="px-6 pt-6 pb-16">
          <EpisodeStill
            className="w-full rounded-card border border-border"
            title={title}
            uri={view.still}
          />
          <View className="mt-5">
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
                <View className="mt-6">
                  <EpisodeOverview episode={view.episode} />
                </View>
              </>
            )}
          </View>
          <EpisodeCreditsSection number={number} season={season} tmdbId={view.tmdbId} />
          <EpisodeSeriesLink id={item.id} />
        </View>
      </ScrollView>

      <PresstableOpacity
        accessibilityLabel="Close"
        accessibilityRole="button"
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-surface/90 border border-border items-center justify-center"
        onPress={onBack}
      >
        <Ionicons
          color={typeof foreground === 'string' ? foreground : undefined}
          name="close"
          size={18}
        />
      </PresstableOpacity>
    </View>
  );
}
