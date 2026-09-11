import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, Text, View } from 'react-native';
// oxlint-disable-next-line no-restricted-imports -- one composed colour, see the call site.
import { useCSSVariable } from 'uniwind';

import { FloatingBackButton } from '@/components/floating-back-button';
import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import type { NormalizedMediaItem } from '@/types/media';

import {
  EpisodeCreditsSection,
  EpisodeHeaderSkeleton,
  EpisodeHeading,
  EpisodeLogs,
  EpisodeOverview,
  EpisodeSeriesLink,
} from '@/features/episode-details/episode-sections';
import { useEpisode } from '@/features/episode-details/use-episode';
import { useEpisodeLogs } from '@/features/episode-details/use-episode-logs';

/** Mirrors index.ios.tsx / index.web.tsx — keep the three variants' props identical. */
export interface EpisodeScreenProps {
  item: NormalizedMediaItem;
  season: number;
  number: number;
  onBack: () => void;
}

/**
 * Android (and the tsc default): a full-screen push shaped like the show's
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
          <EpisodeCreditsSection number={number} season={season} tmdbId={view.tmdbId} />
          <EpisodeSeriesLink id={item.id} />
        </View>
      </ScrollView>

      <FloatingBackButton onPress={onBack} />
    </View>
  );
}
