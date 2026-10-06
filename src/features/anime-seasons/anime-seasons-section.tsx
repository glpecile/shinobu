import { View } from 'react-native';
import { useState } from 'react';

import { Section } from '@/components/section';
import { Skeleton } from '@/components/skeleton';
import { SuspenseSection } from '@/components/suspense-section';
import { isCleanWriteReport } from '@/features/write-sheet/is-clean-report';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import type { ProviderId } from '@/lib/providers/types';
import { hasAired } from '@/lib/time/has-aired';
import {
  LogConfirmSheet,
} from '@/features/log-media/log-confirm-sheet';
import { useLogMedia } from '@/features/log-media/use-log-media';
import { useLogTargetsSplit } from '@/features/log-media/use-log-targets';
import { parseTags } from '@/features/log-media/parse-tags';
import { logToastCopy } from '@/features/log-media/toast-copy';
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

  const logMedia = useLogMedia();
  const [pending, setPending] = useState<PendingLog | null>(null);
  const [watchedAt, setWatchedAt] = useState<Date | null>(null);
  // Diary tags — Serializd accepts them on a mapped anime-series log (plan 0017 R10).
  const [tags, setTags] = useState('');
  const [liked, setLiked] = useState(false);
  const [selectedProviders, setSelectedProviders] =
    useState<ProviderId[]>(targets);

  const progress = entryState?.entry?.progress ?? item.currentProgress;
  const watched = watchedKeys(progress);

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
    haptics.selection();
    logMedia.reset();
    setWatchedAt(null);
    setTags('');
    setLiked(false);
    setSelectedProviders(targets);
    setPending(next);
  }

  function confirmLog() {
    if (pending == null || logMedia.isPending || selectedProviders.length === 0)
      return;
    haptics.confirm();
    const parsedTags = parseTags(tags);
    logMedia.mutate(
      {
        item,
        ...(pending.entryEpisodes != null
          ? { entryEpisodes: pending.entryEpisodes }
          : {}),
        ...(watchedAt != null ? { watchedAt: watchedAt.toISOString() } : {}),
        ...(parsedTags.length > 0 ? { tags: parsedTags } : {}),
        providers: selectedProviders,
        liked,
      },
      {
        onSuccess: (outcome) => {
          // Clean → toast + close; post-write news keeps the sheet open (plan
          // 0032 R4/KTD-3, plan 0033 R1). The toast wrapper owns the haptic.
          if (isCleanWriteReport(outcome)) {
            const copy = logToastCopy(outcome);
            toast.success(copy.title, copy.message);
            setPending(null);
          } else if (outcome.failed.length > 0) {
            haptics.error();
          }
        },
        onError: () => haptics.error(),
      },
    );
  }

  return (
    <>
      <DetailsList
        {...page}
        episodeSection={{
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
            const aired = s.episodes.filter((e) => hasAired(e.firstAired));
            if (aired.length === 0) return;
            const label = canonicalTitle ?? 'all episodes';
            openLog({
              title: `Log ${label}`,
              description: `“${item.title}” — ${aired.length} aired ${
                aired.length === 1 ? 'episode' : 'episodes'
              }.`,
              entryEpisodes: aired.map((episode) => episode.number),
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

      <LogConfirmSheet
        confirmLabel={pending?.title ?? ''}
        description={pending?.description ?? ''}
        item={item}
        logMedia={logMedia}
        manualTargets={manualTargets}
        onClose={() => setPending(null)}
        onConfirm={confirmLog}
        onSelectedProvidersChange={setSelectedProviders}
        onTagsChange={setTags}
        liked={liked}
        onLikedChange={setLiked}
        onWatchedAtChange={setWatchedAt}
        open={pending != null}
        pendingLabel="Logging…"
        selectedProviders={selectedProviders}
        tags={tags}
        targets={targets}
        title={pending?.title ?? ''}
        watchedAt={watchedAt}
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
