import { View } from 'react-native';
import { useState } from 'react';

import { Section } from '@/components/section';
import { Skeleton } from '@/components/skeleton';
import { SuspenseSection } from '@/components/suspense-section';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { airedAnimeEpisodes } from '@/features/log-media/session/queue';
import { useCatchUpControls } from '@/features/log-media/session/state';
import { useLogTargetsSplit } from '@/features/log-media/use-log-targets';
import type { PendingLog } from '@/features/show-seasons/season-accordion';
import {
  formatRuntime,
  seasonRuntimeMinutes,
} from '@/features/show-seasons/runtime';
import {
  useAniListEpisodesQuery,
  useAniListEntryStateQuery,
  useSuspenseAniListEpisodesQuery,
} from '@/state/queries/anilist';
import { DetailsList, type DetailsListProps } from '@/features/show-seasons/details-list';
import {
  EpisodeActionsSheet,
  type EpisodePointer,
} from '@/features/episode-details';
import { usePushRoute } from '@/lib/navigation';
import { placeInLayout } from '@/lib/providers/mapping/season-layout';
import { routes } from '@/lib/routes';
import {
  useAniZipEpisodeMapQuery,
  useSeasonLayoutQuery,
} from '@/state/queries/mapping';
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

/**
 * Entry-relative, always (plan 0027 U5): the accordion's section index stays 1
 * and the keys derive from the AniList entry's own progress, no matter which
 * canonical season the header ends up displaying. Keying these off the mapped
 * season would tick every checkmark off by a whole season.
 */
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
        {runtime > 0 && <Section.Subtitle>{`${formatRuntime(runtime)} total runtime`}</Section.Subtitle>}
      </Section.Header>
    </Section>
  );
}

function AnimeDetailsList({ item, resetKey, ...page }: {
  item: NormalizedMediaItem;
  resetKey?: unknown;
} & DetailsListProps) {
  const mediaId = item.externalIds.anilist!;
  const { data: season } = useAniListEpisodesQuery({ mediaId });
  const connected = useConnectedProviders();
  const { data: entryState } = useAniListEntryStateQuery({
    mediaId,
    enabled: connected.includes('anilist'),
  });
  const { writable: targets, manual: manualTargets } = useLogTargetsSplit(item);
  // A manual-only target still needs the sheet openable (plan 0022 R3) —
  // matches LogMediaButton's gate.
  const canLog = targets.length > 0 || manualTargets.length > 0;

  const { openLog: openLogSession } = useCatchUpControls();

  const progress = entryState?.entry?.progress ?? item.currentProgress;
  const watched = watchedKeys(progress);
  const aired = new Set(airedAnimeEpisodes(item, season?.episodes ?? [], null).map((episode) => episode.number));
  const isEpisodeAired = (episode: NormalizedEpisode) => aired.has(episode.number);

  // R8, display only: show the entry's *true* canonical season in the header
  // ("Season 2" for a sequel entry) instead of the synthesized label. Mounting
  // this query here is R7's one sanctioned render-path episode-map read — a
  // details screen, not a feed row — and it doubles as the pre-warm for a log
  // started from this very screen, so the confirm doesn't wait on ani.zip.
  const { data: episodeMap } = useAniZipEpisodeMapQuery(mediaId);
  const canonicalTitle = canonicalSeasonTitle(episodeMap);
  const labelled =
    canonicalTitle == null || season == null ? season : { ...season, title: canonicalTitle };

  // Episode screen + sheet for an anime row: the row is entry-relative, the
  // episode surfaces are TMDB-numbered, so each tap places the row's ani.zip
  // mapping on TMDB's season layout — the same arbiter the log fan-out uses
  // (plan 0027, `placeInLayout`). Needs the TMDB id the details screen's
  // catalogue merge put on `item`; without it (or an unmapped row) the tap
  // says why instead of opening a screen that can't load.
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

  // Pre-airing series drop the whole block: every row would read "Unaired"
  // next to a 0/total tile that says the same thing twice.
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
              errorToast={{ title: 'Episodes unavailable', message: 'AniList didn’t respond — pull to refresh to try again.' }}
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
              // Entry-relative: the log fan-out handles canonical provider numbering.
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

/**
 * Anime details use the same flat episode list as TV. Rows stay entry-relative;
 * only navigation and logging translate them to canonical provider numbering.
 */
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

  return (
    <AnimeDetailsList {...layout} item={item} resetKey={resetKey} />
  );
}
