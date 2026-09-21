import { useEffect } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { FadeOut } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { BlurEnter } from '@/components/blur-enter';
import { ExpandableText } from '@/components/expandable-text';
import { FloatingBackButton } from '@/components/floating-back-button';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { DURATION } from '@/lib/motion';
import { PeopleSectionsSkeleton } from '@/features/person/people-section';
import { ProviderLinksSection } from '@/features/provider-links/provider-links-section';
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
  useGoToEpisode,
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
 * the heading (a 16:9 image stacked over text wastes the width a desktop
 * has); narrow ones stack like the native screens. The overview and credits
 * run the full width below either way.
 */
export function EpisodeScreen({ item, season, number, onBack }: EpisodeScreenProps) {
  const view = useEpisode(item, season, number);
  const logs = useEpisodeLogs(item, season, number, view.episode?.firstAired);
  const { width } = useWindowDimensions();
  const wide = width >= TWO_COLUMN_MIN_WIDTH;
  const title = view.episode?.title ?? '';
  const go = useGoToEpisode(item.id);
  const { prev, next } = view;
  // ← / → step between episodes — the keyboard's swipe. A subscription to
  // the document, so an effect; skipped while a field has focus.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const focused = document.activeElement;
      if (
        focused instanceof HTMLInputElement ||
        focused instanceof HTMLTextAreaElement ||
        (focused instanceof HTMLElement && focused.isContentEditable)
      ) {
        return;
      }
      const target = event.key === 'ArrowRight' ? next : event.key === 'ArrowLeft' ? prev : undefined;
      if (target == null) return;
      event.preventDefault();
      go(target);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [go, next, prev]);

  if (view.episode == null && view.isLoading) {
    return <EpisodeScreenSkeleton onBack={onBack} />;
  }

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
                    className="mt-5 self-start"
                    episode={view.episode}
                    item={item}
                    next={view.next}
                    number={number}
                    season={season}
                    watched={logs.length > 0}
                  />
                </>
              )}
            </View>
          </View>
          {view.episode != null && (
            <EpisodeOverview className="mt-6" episode={view.episode} />
          )}
          <EpisodeCreditsSection number={number} season={season} tmdbId={view.tmdbId} />
          <EpisodeNav
            className="mt-8"
            id={item.id}
            next={view.next}
            prev={view.prev}
          />
          <EpisodeSeriesLink className="mt-3" id={item.id} />
          <ProviderLinksSection episode={{ season, number }} item={item} />
        </BlurEnter>
      </ScrollView>

      <FloatingBackButton onPress={onBack} />
    </View>
  );
}

/** Mirrors index.tsx — one shape for the route's and the screen's loading phase. */
export function EpisodeScreenSkeleton({ onBack }: { onBack: () => void }) {
  const { width } = useWindowDimensions();
  const wide = width >= TWO_COLUMN_MIN_WIDTH;
  return (
    <AnimatedView className="flex-1 bg-background" exiting={FadeOut.duration(DURATION.exit)}>
      <View className="w-full max-w-4xl self-center px-6 pt-24 pb-12">
        <View className={cn(wide && 'flex-row gap-8 items-start')}>
          <Skeleton
            className={cn('aspect-video rounded-card', wide ? 'flex-1' : 'w-full')}
            delay={staggerDelay(0)}
          />
          <View className={cn('flex-1', !wide && 'mt-5')}>
            <EpisodeHeaderSkeleton />
            <Skeleton className="h-12 w-44 rounded-full mt-5" delay={staggerDelay(1)} />
          </View>
        </View>
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
