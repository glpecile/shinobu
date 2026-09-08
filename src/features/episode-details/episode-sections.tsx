import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ExpandableText } from '@/components/expandable-text';
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
import { PROVIDERS } from '@/lib/providers/registry';
import { useSuspenseTmdbEpisodeQuery } from '@/state/queries/tmdb';
import type { NormalizedEpisode } from '@/types/media';

import type { EpisodeLog } from './use-episode-logs';
import { episodeCode, episodeMetaLine, formatAirDate } from './episode-label';

/**
 * The building blocks every episode surface composes — the three screen
 * variants lay them out differently (`./screen`), the long-press sheet uses
 * the small ones. Shared here so a still, a meta line or a log row reads the
 * same wherever it appears.
 */

/**
 * The wide still, or the 忍 placeholder while TMDB hasn't answered / has none.
 * Plain image, not `ZoomableImage`: the iOS variant lives in a form sheet, and
 * the lightbox's zoom transition renders inside the sheet's clip.
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

/** "S2 E10 · Show title" eyebrow, the episode title, air date · runtime, rating. */
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
  const accent = useCSSVariable('--color-accent');
  const meta = episodeMetaLine(episode);
  const centered = align === 'center';
  return (
    <View className={cn(centered && 'items-center')}>
      <Text
        className={cn(
          'text-accent text-xs font-sans-semibold uppercase tracking-wider',
          centered && 'text-center',
        )}
        numberOfLines={1}
      >
        {episodeCode(season, number)} · {showTitle}
      </Text>
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
              color={typeof accent === 'string' ? accent : undefined}
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
  const accent = useCSSVariable('--color-accent');
  if (logs.length === 0) return null;
  return (
    <View className={cn('gap-2', className)}>
      {logs.map((log) => (
        <View className="flex-row items-center gap-2" key={log.provider}>
          <Ionicons
            color={typeof accent === 'string' ? accent : undefined}
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

export function EpisodeOverview({ episode }: { episode: NormalizedEpisode }) {
  if (episode.overview == null) return null;
  return <ExpandableText lines={4} text={episode.overview} />;
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

/** Mirrors the loaded header so content lands without a shift. */
export function EpisodeHeaderSkeleton() {
  return (
    <View>
      <Skeleton className="h-3 w-32 rounded" />
      <Skeleton className="h-8 w-64 rounded mt-2" />
      <Skeleton className="h-3 w-40 rounded mt-2" />
    </View>
  );
}
