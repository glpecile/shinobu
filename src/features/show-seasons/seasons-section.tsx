import { View } from 'react-native';

import { SuspenseSection } from '@/components/suspense-section';
import { Section } from '@/components/section';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { Provider } from '@/lib/providers/types';
import { hasAired } from '@/lib/time/has-aired';
import {
  useShowSeasonsSource,
  useShowSeasonsQuery,
  useSuspenseShowSeasonsQuery,
  type ShowSeasonsSource,
} from '@/state/queries/show-seasons';
import { useSimklEpisodeStateQuery } from '@/state/queries/simkl';
import { simklEpisodeIsWatched } from '@/lib/providers/simkl/episode-state';
import { usePrefetchTmdbEpisode } from '@/state/queries/tmdb';
import { useTraktShowProgressQuery } from '@/state/queries/trakt';
import { useConnectedProviders } from '@/state/session';
import { useState } from 'react';
import type { NormalizedEpisode, NormalizedMediaItem, NormalizedSeason } from '@/types/media';
import { useLogTargetsSplit } from '@/features/log-media/use-log-targets';
import { withLoggedKeys } from '@/features/log-media/optimistic';
import { useLoggedWatches } from '@/features/log-media/logged-context';
import { useCatchUpControls } from '@/features/log-media/session/state';
import { EpisodeActionsSheet, type EpisodePointer } from '@/features/episode-details';
import { episodeCode } from '@/features/episode-details/episode-label';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { preAiringDisplay } from '@/features/log-media/release-gate';
import { DetailsList, type DetailsListProps } from './details-list';
import type { PendingLog } from './season-accordion';

function SeasonsSkeleton() {
  return (
    <View className="mt-8">
      <Skeleton className="h-7 w-32 rounded mb-4" />
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton
          className={cn('h-17 rounded-lg', index > 0 && 'mt-3')}
          delay={staggerDelay(index)}
          key={index}
        />
      ))}
    </View>
  );
}

/** Suspends on the season list so a failed load surfaces through its boundary's toast. */
function SeasonsHeading({ source }: { source: ShowSeasonsSource }) {
  useSuspenseShowSeasonsQuery(source);
  return (
    <Section>
      <Section.Header>
        <Section.Title>Seasons</Section.Title>
      </Section.Header>
    </Section>
  );
}

function ShowDetailsList({
  item,
  source,
  resetKey,
  ...layout
}: {
  item: NormalizedMediaItem;
  source: ShowSeasonsSource;
  resetKey?: unknown;
} & DetailsListProps) {
  const traktId = item.externalIds.trakt;
  const connected = useConnectedProviders();
  const seasonsData = useShowSeasonsQuery(source).data;
  const seasons = seasonsData ?? [];
  const { writable: targets, manual: manualTargets } = useLogTargetsSplit(item);
  const canLog = targets.length > 0 || manualTargets.length > 0;
  const { data: traktWatched } = useTraktShowProgressQuery({
    traktId: traktId ?? undefined,
    enabled: connected.includes(Provider.Trakt) && traktId != null,
  });
  const { data: simklEntry } = useSimklEpisodeStateQuery({
    item,
    enabled: connected.includes(Provider.Simkl),
  });
  const logged = useLoggedWatches();
  const watchedKeys = withLoggedKeys(
    traktWatched?.watchedKeys ??
      new Set(
        seasons.flatMap((season) =>
          season.episodes
            .filter((episode) =>
              simklEpisodeIsWatched(simklEntry, season.number, episode.number, episode.firstAired),
            )
            .map((episode) => `${season.number}-${episode.number}`),
        ),
      ),
    item,
    logged,
  );

  const { openLog: openLogSession } = useCatchUpControls();
  const pushRoute = usePushRoute();
  const prefetchEpisode = usePrefetchTmdbEpisode();
  const [pressed, setPressed] = useState<{
    season: NormalizedSeason;
    episode: NormalizedEpisode;
  } | null>(null);
  const pointer: EpisodePointer | null =
    pressed == null
      ? null
      : { season: pressed.season.number, number: pressed.episode.number, episode: pressed.episode };
  const [actionsOpen, setActionsOpen] = useState(false);
  function openLog(next: PendingLog) {
    if (!canLog) return;
    openLogSession({ item, ...next });
  }

  function markEpisode(s: NormalizedSeason, episode: NormalizedEpisode) {
    openLog({
      title: `Log ${episodeCode(s.number, episode.number)}`,
      description: `“${item.title}” — ${episodeCode(s.number, episode.number)}: ${episode.title}`,
      episodes: [{ season: s.number, number: episode.number }],
    });
  }

  if (
    preAiringDisplay(
      item,
      seasonsData?.flatMap((season) => season.episodes),
      Math.max(watchedKeys.size, item.currentProgress),
    ) !== 'progress'
  ) {
    return <DetailsList {...layout} />;
  }

  return (
    <>
      <DetailsList
        {...layout}
        episodeSection={{
          seasons,
          watched: watchedKeys,
          heading: (
            <SuspenseSection
              errorToast={{
                title: 'Episodes unavailable',
                message: 'Pull to refresh to try again.',
              }}
              fallback={<SeasonsSkeleton />}
              resetKey={resetKey}
            >
              <SeasonsHeading source={source} />
            </SuspenseSection>
          ),
          onEpisodeActions: (s, episode) => {
            haptics.selection();
            setPressed({ season: s, episode });
            setActionsOpen(true);
          },
          onMarkEpisode: markEpisode,
          onOpenEpisode: (s, episode) => {
            prefetchEpisode({
              tmdbId: item.externalIds.tmdb,
              season: s.number,
              number: episode.number,
            });
            pushRoute(routes.episode(item.id, s.number, episode.number));
          },
          onMarkSeason: (s) => {
            const aired = s.episodes.filter((e) => hasAired(e.firstAired));
            if (aired.length === 0) return;
            openLog({
              title: `Log ${s.title}`,
              batch: true,
              description: `“${item.title}” — ${aired.length} aired ${
                aired.length === 1 ? 'episode' : 'episodes'
              } in ${s.title}.`,
              episodes: aired.map((episode) => ({
                season: s.number,
                number: episode.number,
              })),
            });
          },
        }}
      />

      <EpisodeActionsSheet
        item={item}
        onClose={() => setActionsOpen(false)}
        onMark={() => {
          if (pressed == null) return;
          setActionsOpen(false);
          markEpisode(pressed.season, pressed.episode);
        }}
        open={actionsOpen}
        pointer={pointer}
        watched={
          pointer != null && watchedKeys?.has(`${pointer.season}-${pointer.number}`) === true
        }
      />
    </>
  );
}

export function SeasonsSection({
  item,
  resetKey,
  ...layout
}: {
  item: NormalizedMediaItem;
  resetKey?: unknown;
} & DetailsListProps) {
  const source = useShowSeasonsSource(item);
  if (source == null) return <DetailsList {...layout} />;
  return <ShowDetailsList {...layout} item={item} resetKey={resetKey} source={source} />;
}
