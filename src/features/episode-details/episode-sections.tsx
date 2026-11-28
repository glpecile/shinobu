import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useRouter } from 'expo-router';
import { createContext, use, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ExpandableText } from '@/components/expandable-text';
import { Fab } from '@/components/fab';
import { Eyebrow } from '@/components/eyebrow';
import { Image } from '@/components/image';
import { MetaLine } from '@/components/meta-line';
import { MorphText } from '@/components/morph-text';
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
import { episodeCode, formatAirDate } from './episode-label';
import type { EpisodeRef } from './episode-neighbours';

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

export function EpisodeHeading({
  id,
  showTitle,
  season,
  number,
  episode,
  align = 'left',
}: {
  id: string;
  showTitle: string;
  season: number;
  number: number;
  episode: NormalizedEpisode;
  align?: 'left' | 'center';
}) {
  const pushRoute = usePushRoute();
  const centered = align === 'center';
  function goToSeries() {
    if (pushRoute(routes.details(id, 'TV'))) haptics.selection();
  }
  return (
    <View className={cn(centered && 'items-center')}>
      <Eyebrow className={cn(centered && 'text-center')} numberOfLines={1}>
        {episodeCode(season, number)} ·{' '}
        <Text accessibilityRole="link" onPress={goToSeries}>
          {showTitle}
        </Text>
      </Eyebrow>
      <Text
        accessibilityRole="link"
        className={cn('text-3xl font-display text-foreground mt-1', centered && 'text-center')}
        onPress={goToSeries}
      >
        {episode.title}
      </Text>
      <MetaLine
        align={align}
        className="mt-1.5"
        parts={[
          episode.firstAired != null && (
            <MetaLine.Part icon="calendar-outline">
              {formatAirDate(episode.firstAired)}
            </MetaLine.Part>
          ),
          episode.runtime != null && (
            <MetaLine.Part icon="time-outline">{`${episode.runtime} min`}</MetaLine.Part>
          ),
        ]}
      />
    </View>
  );
}

export function EpisodeLogs({ logs, className }: { logs: EpisodeLog[]; className?: string }) {
  const accent = useThemeColor('--color-accent');
  if (logs.length === 0) return null;
  const labels = logs.map((log) => PROVIDERS[log.provider].label);
  const names =
    labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} & ${labels.at(-1)}`;
  const watchedAt = logs
    .flatMap((log) => (log.watchedAt != null ? [log.watchedAt] : []))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  return (
    <View className={cn('flex-row items-center gap-2', className)}>
      <Ionicons color={accent} name="eye" size={14} />
      {logs.map((log) => (
        <ProviderIcon id={log.provider} key={log.provider} size={16} />
      ))}
      <Text className="flex-1 text-muted font-sans text-sm">
        Logged on {names}
        {watchedAt != null ? ` · ${formatAirDate(watchedAt)}` : ''}
      </Text>
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
      <PersonCreditSheet credit={credit} onClose={() => setCreditOpen(false)} open={creditOpen} />
    </>
  );
}

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

export const EpisodeStep = createContext<((target: EpisodeRef) => void) | null>(null);

export function useGoToEpisode() {
  const router = useRouter();
  const step = use(EpisodeStep);
  return (
    step ??
    ((target: EpisodeRef) =>
      router.setParams({ episode: [String(target.season), String(target.number)] }))
  );
}

export function EpisodeNavigation({
  id,
  prev,
  next,
  season,
  number,
}: {
  id: string;
  prev: EpisodeRef | undefined;
  next: EpisodeRef | undefined;
  season: number;
  number: number;
}) {
  const go = useGoToEpisode();
  const pushRoute = usePushRoute();
  const insets = useSafeAreaInsets();
  const [showSeriesHint, setShowSeriesHint] = useState(false);
  function step(target: EpisodeRef | undefined) {
    if (target == null) return;
    haptics.selection();
    go(target);
  }
  return (
    <View
      className="absolute self-center web:self-end web:mr-4 flex-row items-center gap-2"
      style={{ bottom: insets.bottom + 12 }}
    >
      <Button.Capsule className="w-52" floating>
        <Button
          disabled={prev == null}
          icon={<Button.Icon name="chevron-back" />}
          iconOnly
          label="Previous"
          onPress={() => step(prev)}
          variant="ghost"
        />
        <View className="flex-1 items-center">
          <MorphText className="font-sans-semibold text-lg text-foreground self-center tabular-nums">
            {episodeCode(season, number)}
          </MorphText>
        </View>
        <Button
          disabled={next == null}
          icon={<Button.Icon name="chevron-forward" />}
          iconOnly
          label="Next"
          onPress={() => step(next)}
          variant="ghost"
        />
      </Button.Capsule>
      <View
        className="relative"
        onPointerEnter={() => setShowSeriesHint(true)}
        onPointerLeave={() => setShowSeriesHint(false)}
        {...(process.env.EXPO_OS === 'web'
          ? {
              onFocus: () => setShowSeriesHint(true),
              onBlur: () => setShowSeriesHint(false),
            }
          : {})}
      >
        {process.env.EXPO_OS === 'web' && showSeriesHint && (
          <View
            className="absolute bottom-full right-0 mb-2 px-3 py-2 rounded-md border border-border bg-surface shadow-sm"
            style={{ pointerEvents: 'none' }}
          >
            <Text className="font-sans text-xs text-foreground whitespace-nowrap">View series</Text>
          </View>
        )}
        <Fab
          icon="tv-outline"
          label="View series"
          size="md"
          onPress={() => pushRoute(routes.details(id, 'TV'))}
        />
      </View>
    </View>
  );
}

export function EpisodeHeaderSkeleton() {
  return (
    <View>
      <Skeleton className="h-3 w-32 rounded mt-0.5" />
      <Skeleton className="h-7 w-64 rounded mt-2.5" />
      <Skeleton className="h-3.5 w-40 rounded mt-3" />
    </View>
  );
}
