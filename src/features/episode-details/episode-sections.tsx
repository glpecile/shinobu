import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ExpandableText } from '@/components/expandable-text';
import { Eyebrow } from '@/components/eyebrow';
import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { ProviderIcon } from '@/components/provider-icon';
import { Skeleton } from '@/components/skeleton';
import { SuspenseSection } from '@/components/suspense-section';
import {
  PeopleSection,
  PeopleSectionsSkeleton,
  PersonCreditSheet,
  type PersonCredit,
} from '@/features/person';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { usePushRoute } from '@/lib/navigation';
import { PROVIDERS } from '@/lib/providers/registry';
import { routes } from '@/lib/routes';
import { useThemeColor } from '@/lib/theme-color';
import { useSuspenseTmdbEpisodeQuery } from '@/state/queries/tmdb';
import type { NormalizedEpisode } from '@/types/media';

import type { EpisodeLog } from './use-episode-logs';
import { episodeCode, episodeMetaLine, formatAirDate } from './episode-label';
import type { EpisodeRef } from './episode-neighbours';

/**
 * The building blocks every episode surface composes — the three screen
 * variants lay them out differently (`./screen`), the long-press sheet uses
 * the small ones. Shared here so a still, a meta line or a log row reads the
 * same wherever it appears.
 */

/**
 * The wide still, or the 忍 placeholder while TMDB hasn't answered / has none.
 * Plain image, not `ZoomableImage`: the actions sheet draws it too, and the
 * lightbox's zoom transition renders inside the sheet's clip.
 */
export function EpisodeStill({
  uri,
  title,
  className,
}: {
  uri: string;
  title: string;
  className?: string;
}) {
  if (uri === '') {
    return <PosterPlaceholder className={cn('aspect-video', className)} />;
  }
  return (
    <Image
      accessibilityLabel={title}
      className={cn('aspect-video bg-surface', className)}
      contentFit="cover"
      source={{ uri }}
    />
  );
}

/** "S2E10 · Show title" eyebrow, the episode title, air date · runtime, rating. */
export function EpisodeHeading({
  showTitle,
  season,
  number,
  episode,
  rating,
  align = 'left',
}: {
  showTitle: string;
  season: number;
  number: number;
  episode: NormalizedEpisode;
  rating?: number | undefined;
  align?: 'left' | 'center';
}) {
  const accent = useThemeColor('--color-accent');
  const meta = episodeMetaLine(episode);
  const centered = align === 'center';
  return (
    <View className={cn(centered && 'items-center')}>
      <Eyebrow className={cn(centered && 'text-center')} numberOfLines={1} tone="accent">
        {episodeCode(season, number)} · {showTitle}
      </Eyebrow>
      <Text
        className={cn('text-3xl font-display text-foreground mt-1', centered && 'text-center')}
      >
        {episode.title}
      </Text>
      <View className={cn('flex-row items-center gap-3 mt-1.5', centered && 'justify-center')}>
        {meta !== '' && (
          <Text className="text-muted font-sans text-sm">{meta}</Text>
        )}
        {rating != null && (
          <View className="flex-row items-center gap-1">
            <Ionicons
              color={accent}
              name="star"
              size={12}
            />
            <Text className="text-foreground text-xs font-sans-semibold">
              {rating.toFixed(1)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * "Logged on Trakt · Sep 3, 2026" — one row per provider that records the
 * episode as watched. Nothing when none does: an absent line is honest, a
 * "not logged" line would overclaim for the providers this can't read.
 */
export function EpisodeLogs({
  logs,
  className,
}: {
  logs: EpisodeLog[];
  className?: string;
}) {
  const accent = useThemeColor('--color-accent');
  if (logs.length === 0) return null;
  return (
    <View className={cn('gap-2', className)}>
      {logs.map((log) => (
        <View className="flex-row items-center gap-2" key={log.provider}>
          <Ionicons
            color={accent}
            name="checkmark-circle"
            size={14}
          />
          <ProviderIcon id={log.provider} size={16} />
          <Text className="text-muted font-sans text-sm">
            Logged on {PROVIDERS[log.provider].label}
            {log.watchedAt != null ? ` · ${formatAirDate(log.watchedAt)}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function EpisodeOverview({
  episode,
  className,
}: {
  episode: NormalizedEpisode;
  className?: string;
}) {
  if (episode.overview == null) return null;
  return <ExpandableText className={className} lines={4} text={episode.overview} />;
}

function EpisodeCredits({
  tmdbId,
  season,
  number,
}: {
  tmdbId: number;
  season: number;
  number: number;
}) {
  const { data } = useSuspenseTmdbEpisodeQuery({ tmdbId, season, number });
  // Same long-press → credit sheet contract as the details screen's rails.
  const [credit, setCredit] = useState<PersonCredit | null>(null);
  const [creditOpen, setCreditOpen] = useState(false);

  function openCredit(next: PersonCredit) {
    haptics.selection();
    setCredit(next);
    setCreditOpen(true);
  }

  return (
    <>
      <PeopleSection
        onCreditActions={openCredit}
        people={data.cast.map((member) => ({
          id: member.id,
          name: member.name,
          role: member.character,
          kind: 'cast' as const,
          headshot: member.headshot,
          ...(member.tmdbId != null ? { tmdbId: member.tmdbId } : {}),
        }))}
        title="Cast"
      />
      <PeopleSection
        onCreditActions={openCredit}
        people={data.crew.map((member) => ({
          id: member.id,
          name: member.name,
          role: member.job,
          kind: 'crew' as const,
          headshot: member.headshot,
          ...(member.tmdbId != null ? { tmdbId: member.tmdbId } : {}),
        }))}
        title="Crew"
      />
      <PersonCreditSheet
        credit={credit}
        onClose={() => setCreditOpen(false)}
        open={creditOpen}
      />
    </>
  );
}

/**
 * Cast + crew credited on this episode, behind their own boundary so a TMDB
 * miss degrades to no rails rather than no screen. Renders nothing without a
 * TMDB id or token — TMDB is the only source that credits people per episode.
 */
export function EpisodeCreditsSection({
  tmdbId,
  season,
  number,
}: {
  tmdbId: number | undefined;
  season: number;
  number: number;
}) {
  if (tmdbId == null) return null;
  return (
    <SuspenseSection fallback={<PeopleSectionsSkeleton />}>
      <EpisodeCredits number={number} season={season} tmdbId={tmdbId} />
    </SuspenseSection>
  );
}

/**
 * The way back up to the show. An episode is reachable from surfaces that
 * never pass through the show — a diary row, a notification tap — so the
 * eyebrow's "S1E10 · Show" is the only mention of the series and it isn't a
 * link. Same shape as the credit and studio sheets' route buttons.
 */
export function EpisodeSeriesLink({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const pushRoute = usePushRoute();
  return (
    <Button
      className={cn('mt-8', className)}
      icon={<Button.Icon name="tv-outline" />}
      label="View series"
      onPress={() => pushRoute(routes.details(id))}
      variant="quiet"
    />
  );
}

/**
 * The one way an episode screen steps to a sibling — the nav buttons, the
 * native swipe and the web arrow keys all call this. `replace`, not push:
 * stepping through episodes must not stack one screen per step, so back
 * still returns to the show. The direction is derived from the target's
 * position so the root stack can animate a step back as a pop.
 */
export function useGoToEpisode(id: string, season: number, number: number) {
  const router = useRouter();
  // push-guard-exempt: `replace`, see above.
  return (target: EpisodeRef) => {
    const back =
      target.season < season || (target.season === season && target.number < number);
    router.replace(routes.episode(id, target.season, target.number, back ? 'back' : 'forward'));
  };
}

/**
 * Previous / next episode, across season boundaries, from the show's layout
 * (`useEpisode` → `episodeNeighbours`). Always the tracker's explicit
 * `season`+`number`, which is what the route places without ani.zip.
 */
export function EpisodeNav({
  id,
  season,
  number,
  prev,
  next,
  className,
}: {
  id: string;
  season: number;
  number: number;
  prev: EpisodeRef | undefined;
  next: EpisodeRef | undefined;
  className?: string;
}) {
  const go = useGoToEpisode(id, season, number);
  return (
    <View className={cn('flex-row gap-3', className)}>
      <Button
        className="flex-1"
        disabled={prev == null}
        icon={<Button.Icon name="chevron-back" />}
        label="Previous"
        onPress={() => prev != null && go(prev)}
        size="sm"
        variant="quiet"
      />
      <Button
        className="flex-1"
        disabled={next == null}
        icon={<Button.Icon name="chevron-forward" />}
        label="Next"
        onPress={() => next != null && go(next)}
        size="sm"
        variant="quiet"
      />
    </View>
  );
}

/**
 * Mirrors the loaded header so content lands without a shift: the eyebrow's
 * 16px line, the title's 36px line a `mt-1` under it, the meta line's 20px a
 * `mt-1.5` under that — each bar centred in its text line.
 */
export function EpisodeHeaderSkeleton() {
  return (
    <View>
      <Skeleton className="h-3 w-32 rounded mt-0.5" />
      <Skeleton className="h-7 w-64 rounded mt-2.5" />
      <Skeleton className="h-3.5 w-40 rounded mt-3" />
    </View>
  );
}
