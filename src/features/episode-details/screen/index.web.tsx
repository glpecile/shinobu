import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { FadeOut } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { BlurEnter } from '@/components/blur-enter';
import { ExpandableText } from '@/components/expandable-text';
import { FloatingBackButton } from '@/components/floating-back-button';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { ZoomableImage } from '@/components/zoomable-image';
import { DURATION } from '@/lib/motion';
import { PeopleSectionsSkeleton } from '@/features/person/people-section';
import { ProviderLinksSection } from '@/features/provider-links/provider-links-section';
import Head from '@/components/head';
import { cn } from '@/lib/cn';
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
 * Web: a page inside the sidebar shell. Wide viewports match the details
 * header: heading and overview on the left, the still pinned top right, the
 * log button full width below. Narrow ones stack like the native screens.
 */
export function EpisodeScreen({ item, season, number, onBack }: EpisodeScreenProps) {
  const view = useEpisode(item, season, number);
  const logs = useEpisodeLogs(item, season, number, view.episode?.firstAired);
  const { width } = useWindowDimensions();
  const wide = width >= TWO_COLUMN_MIN_WIDTH;
  const title = view.episode?.title ?? '';
  const go = useGoToEpisode();
  const { prev, next } = view;
  // Web stacks keep covered screens mounted, so a screen pushed on top (the
  // series via "View series") would otherwise still hear the arrows.
  const isFocused = useIsFocused();
  // ← / → step between episodes — the keyboard's swipe. A subscription to
  // the document, so an effect; skipped while a field has focus.
  useEffect(() => {
    if (!isFocused) return;
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
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      // Claimed even at either end: Safari rubber-bands the page on an
      // unhandled arrow key.
      event.preventDefault();
      const target = event.key === 'ArrowRight' ? next : prev;
      if (target != null) go(target);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFocused, go, next, prev]);

  return (
    <View className="flex-1 bg-background">
      <Head>
        <title>{`${title === '' ? 'Episode' : title} — ${item.title} — Shinobu`}</title>
        {view.episode?.overview != null && (
          <meta content={view.episode.overview} name="description" />
        )}
      </Head>
      {view.episode == null && view.isLoading ? <EpisodeScreenSkeleton onBack={onBack} /> : <ScrollView className="flex-1">
        <BlurEnter className="w-full max-w-4xl self-center px-6 pt-24 pb-44">
          <View className={cn(wide ? 'flex-row gap-8 items-start' : 'flex-col-reverse gap-5')}>
            <View className="flex-1">
              {view.episode == null ? (
                <Text className="text-muted font-sans">This episode isn’t listed.</Text>
              ) : (
                <>
                  <EpisodeHeading
                    episode={view.episode}
                    id={item.id}
                    number={number}
                    rating={view.rating}
                    season={season}
                    showTitle={item.title}
                  />
                  <EpisodeLogs className="mt-3" logs={logs} />
                  {wide && <EpisodeOverview className="mt-4" episode={view.episode} />}
                </>
              )}
            </View>
            <ZoomableImage
              alt={title}
              className={cn('aspect-video rounded-lg border border-border bg-surface', wide ? 'w-80' : 'w-full')}
              contentFit="cover"
              type="image"
              uri={view.still}
            />
          </View>
          {view.episode != null && (
            <>
              <EpisodeLogButton
                className="mt-6"
                episode={view.episode}
                item={item}
                number={number}
                season={season}
                watched={logs.length > 0}
              />
              {!wide && <EpisodeOverview className="mt-6" episode={view.episode} />}
            </>
          )}
          <EpisodeCreditsSection number={number} season={season} tmdbId={view.tmdbId} />
          <DiscussionSection episode={{ season, number }} item={item} />
          <ProviderLinksSection episode={{ season, number }} item={item} />
        </BlurEnter>
      </ScrollView>}

      {!(view.episode == null && view.isLoading) && <FloatingBackButton onPress={onBack} />}
      <EpisodeNavigation id={item.id} next={view.next} number={number} prev={view.prev} season={season} />
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
        <View className={cn(wide ? 'flex-row gap-8 items-start' : 'flex-col-reverse gap-5')}>
          <View className="flex-1">
            <EpisodeHeaderSkeleton />
            {wide && <ExpandableText.Skeleton className="mt-4" lines={4} />}
          </View>
          <Skeleton
            className={cn('aspect-video rounded-lg', wide ? 'w-80' : 'w-full')}
            delay={staggerDelay(0)}
          />
        </View>
        <Skeleton className="h-12 w-full rounded-full mt-6" delay={staggerDelay(1)} />
        {!wide && <ExpandableText.Skeleton className="mt-6" lines={4} />}
        <PeopleSectionsSkeleton />
      </View>
      <FloatingBackButton onPress={onBack} />
    </AnimatedView>
  );
}
