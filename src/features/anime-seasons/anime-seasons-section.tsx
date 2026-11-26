import { View } from 'react-native';
import { useState } from 'react';

import { Section } from '@/components/section';
import { Skeleton } from '@/components/skeleton';
import { SuspenseSection } from '@/components/suspense-section';
import { haptics } from '@/lib/haptics';
import { Provider } from '@/lib/providers/types';
import { toast } from '@/lib/toast';
import { airedAnimeEpisodes } from '@/features/log-media/session/queue';
import { withLoggedKeys } from '@/features/log-media/optimistic';
import { useLoggedWatches } from '@/features/log-media/logged-context';
import { useCatchUpControls } from '@/features/log-media/session/state';
import { useLogTargetsSplit } from '@/features/log-media/use-log-targets';
import type { PendingLog } from '@/features/show-seasons/season-accordion';
import { formatRuntime, seasonRuntimeMinutes } from '@/features/show-seasons/runtime';
import {
  useAniListEpisodesQuery,
  useAniListEntryStateQuery,
  useSuspenseAniListEpisodesQuery,
} from '@/state/queries/anilist';
import { DetailsList, type DetailsListProps } from '@/features/show-seasons/details-list';
import { EpisodeActionsSheet, type EpisodePointer } from '@/features/episode-details';
import { usePushRoute } from '@/lib/navigation';
import { placeInLayout } from '@/lib/providers/mapping/season-layout';
import { routes } from '@/lib/routes';
import { useAniZipEpisodeMapQuery, useSeasonLayoutQuery } from '@/state/queries/mapping';
import { useConnectedProviders } from '@/state/session';
import { preAiringDisplay } from '@/features/log-media/release-gate';
import { canonicalSeasonTitle } from './season-label';
import type { NormalizedEpisode, NormalizedMediaItem } from '@/types/media';

function SeasonsSkeleton() {
  return (
    <View className="mt-8">
      <Skeleton className="h-6 w-32 rounded mb-4" />
      {Array.from({ length: 1 }).map((_, index) => (
        <Skeleton className="h-16 rounded-lg mb-3" key={index} />
      ))}
    </View>
  );
}

/** AniList entries are always single-season (`1-n`), regardless of the displayed canonical season title. */
function watchedKeys(progress: number): ReadonlySet<string> {
  const keys = new Set<string>();
  for (let number = 1; number <= progress; number++) {
    keys.add(`1-${number}`);
  }
  return keys;
}

function AnimeSeasonsHeading({ mediaId }: { mediaId: number }) {
  const { data: season } = useSuspenseAniListEpisodesQuery({ mediaId });
  const runtime = seasonRuntimeMinutes(season);
  return (
    <Section>
      <Section.Header>
        <Section.Title>Seasons</Section.Title>
        {runtime > 0 && (
          <Section.Subtitle>{`${formatRuntime(runtime)} total runtime`}</Section.Subtitle>
        )}
      </Section.Header>
    </Section>
  );
}

function AnimeDetailsList({
  item,
  resetKey,
  ...page
}: {
  item: NormalizedMediaItem;
  resetKey?: unknown;
} & DetailsListProps) {
  const mediaId = item.externalIds.anilist!;
  const { data: season } = useAniListEpisodesQuery({ mediaId });
  const connected = useConnectedProviders();
  const { data: entryState } = useAniListEntryStateQuery({
    mediaId,
    enabled: connected.includes(Provider.AniList),
  });
  const { writable: targets, manual: manualTargets } = useLogTargetsSplit(item);
  const canLog = targets.length > 0 || manualTargets.length > 0;

  const { openLog: openLogSession } = useCatchUpControls();

  const progress = entryState?.entry?.progress ?? item.currentProgress;
  const watched = withLoggedKeys(watchedKeys(progress), item, useLoggedWatches());
  const aired = new Set(
    airedAnimeEpisodes(item, season?.episodes ?? [], null).map((episode) => episode.number),
  );
  const isEpisodeAired = (episode: NormalizedEpisode) => aired.has(episode.number);

  const { data: episodeMap } = useAniZipEpisodeMapQuery(mediaId);
  const canonicalTitle = canonicalSeasonTitle(episodeMap);
  const labelled =
    canonicalTitle == null || season == null ? season : { ...season, title: canonicalTitle };

  const pushRoute = usePushRoute();
  const tmdbId = item.externalIds.tmdb;
  const { data: layout } = useSeasonLayoutQuery({ tmdb: tmdbId });
  const [pressed, setPressed] = useState<{
    entryNumber: number;
    pointer: EpisodePointer;
  } | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);

  function placeRow(episode: NormalizedEpisode): EpisodePointer | null {
    const row = episodeMap?.get(episode.number);
    const placed = row == null ? null : placeInLayout(layout, row);
    if (tmdbId == null || placed == null) {
      toast.error(
        'Episode details unavailable',
        "This episode isn't mapped to TMDB's numbering yet.",
      );
      return null;
    }
    return { ...placed, episode };
  }

  function openLog(next: PendingLog) {
    if (!canLog) return;
    openLogSession({ item, ...next });
  }

  if (preAiringDisplay(item, season?.episodes, progress) !== 'progress') {
    return <DetailsList {...page} />;
  }

  return (
    <>
      <DetailsList
        {...page}
        episodeSection={{
          isEpisodeAired,
          seasons: labelled == null ? [] : [labelled],
          watched,
          heading: (
            <SuspenseSection
              errorToast={{
                title: 'Episodes unavailable',
                message: 'AniList didn’t respond — pull to refresh to try again.',
              }}
              fallback={<SeasonsSkeleton />}
              resetKey={resetKey}
            >
              <AnimeSeasonsHeading mediaId={mediaId} />
            </SuspenseSection>
          ),
          onEpisodeActions:
            tmdbId == null
              ? undefined
              : (_s, episode) => {
                  const pointer = placeRow(episode);
                  if (pointer == null) return;
                  haptics.selection();
                  setPressed({ entryNumber: episode.number, pointer });
                  setActionsOpen(true);
                },
          onOpenEpisode:
            tmdbId == null
              ? undefined
              : (_s, episode) => {
                  const pointer = placeRow(episode);
                  if (pointer != null) {
                    pushRoute(routes.episode(item.id, pointer.season, pointer.number));
                  }
                },
          onMarkEpisode: (_s, episode) =>
            openLog({
              title: `Log episode ${episode.number}`,
              description: `“${item.title}” — episode ${episode.number}: ${episode.title}`,
              entryEpisodes: [episode.number],
            }),
          onMarkSeason: (s) => {
            const airedEpisodes = s.episodes.filter(isEpisodeAired);
            if (airedEpisodes.length === 0) return;
            const label = canonicalTitle ?? 'all episodes';
            openLog({
              title: `Log ${label}`,
              batch: true,
              description: `“${item.title}” — ${airedEpisodes.length} aired ${
                airedEpisodes.length === 1 ? 'episode' : 'episodes'
              }.`,
              entryEpisodes: airedEpisodes.map((episode) => episode.number),
            });
          },
        }}
      />

      <EpisodeActionsSheet
        aired={pressed == null ? undefined : aired.has(pressed.entryNumber)}
        item={item}
        onClose={() => setActionsOpen(false)}
        onMark={() => {
          if (pressed == null) return;
          setActionsOpen(false);
          const { episode } = pressed.pointer;
          openLog({
            title: `Log episode ${episode.number}`,
            description: `“${item.title}” — episode ${episode.number}: ${episode.title}`,
            entryEpisodes: [pressed.entryNumber],
          });
        }}
        open={actionsOpen}
        pointer={pressed?.pointer ?? null}
        watched={pressed != null && watched.has(`1-${pressed.entryNumber}`)}
      />
    </>
  );
}

export function AnimeSeasonsSection({
  item,
  resetKey,
  ...layout
}: {
  item: NormalizedMediaItem;
  resetKey?: unknown;
} & DetailsListProps) {
  if (item.type !== 'ANIME' || item.isFilm === true || item.externalIds.anilist == null) {
    return <DetailsList {...layout} />;
  }

  return <AnimeDetailsList {...layout} item={item} resetKey={resetKey} />;
}
