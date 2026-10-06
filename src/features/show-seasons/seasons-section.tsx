import { View } from 'react-native';

import { SuspenseSection } from '@/components/suspense-section';
import { Section } from '@/components/section';
import { Skeleton } from '@/components/skeleton';
import { isCleanWriteReport } from '@/features/write-sheet/is-clean-report';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { hasAired } from '@/lib/time/has-aired';
import {
  useShowSeasonsSource,
  useShowSeasonsQuery,
  useSuspenseShowSeasonsQuery,
  type ShowSeasonsSource,
} from '@/state/queries/show-seasons';
import { useSimklEpisodeStateQuery } from '@/state/queries/simkl';
import { simklEpisodeIsWatched } from '@/lib/providers/simkl/episode-state';
import { useTraktShowProgressQuery } from '@/state/queries/trakt';
import { useConnectedProviders } from '@/state/session';
import { useState } from 'react';
import type { ProviderId } from '@/lib/providers/types';
import type {
  NormalizedEpisode,
  NormalizedMediaItem,
  NormalizedSeason,
} from '@/types/media';
import { useLogMedia } from '@/features/log-media/use-log-media';
import { useLogTargetsSplit } from '@/features/log-media/use-log-targets';
import { LogConfirmSheet } from '@/features/log-media/log-confirm-sheet';
import { parseTags } from '@/features/log-media/parse-tags';
import { logToastCopy } from '@/features/log-media/toast-copy';
import {
  EpisodeActionsSheet,
  type EpisodePointer,
} from '@/features/episode-details';
import { episodeCode } from '@/features/episode-details/episode-label';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { DetailsList, type DetailsListProps } from './details-list';
import type { PendingLog } from './season-accordion';
import { formatRuntime, seriesRuntimeMinutes } from './runtime';

function SeasonsSkeleton() {
  return (
    <View className="mt-8">
      <Skeleton className="h-6 w-32 rounded mb-4" />
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton className="h-16 rounded-lg mb-3" key={index} />
      ))}
    </View>
  );
}

/** This boundary owns catalogue loading/errors while the list subscribes to its cached rows. */
function SeasonsHeading({ source }: { source: ShowSeasonsSource }) {
  const { data: seasons } = useSuspenseShowSeasonsQuery(source);
  const total = seriesRuntimeMinutes(seasons);
  return (
    <Section>
      <Section.Header>
        <Section.Title>Seasons</Section.Title>
        {total > 0 && <Section.Subtitle>{`${formatRuntime(total)} total runtime`}</Section.Subtitle>}
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
  const seasons = useShowSeasonsQuery(source).data ?? [];
  // Enrichment-aware: a reverse-mapped anime TV show shows AniList too.
  const { writable: targets, manual: manualTargets } = useLogTargetsSplit(item);
  // A manual-only target still needs the sheet openable (plan 0022 R3) —
  // matches LogMediaButton's gate.
  const canLog = targets.length > 0 || manualTargets.length > 0;
  // Trakt progress takes precedence over Simkl's canonical episode view.
  const { data: traktWatched } = useTraktShowProgressQuery({
    traktId: traktId ?? undefined,
    enabled: connected.includes('trakt') && traktId != null,
  });
  const { data: simklEntry } = useSimklEpisodeStateQuery({
    item,
    enabled: connected.includes('simkl'),
  });
  const watchedKeys =
    traktWatched?.watchedKeys ??
    new Set(seasons.flatMap((season) =>
      season.episodes
        .filter((episode) => simklEpisodeIsWatched(
          simklEntry, season.number, episode.number, episode.firstAired,
        ))
        .map((episode) => `${season.number}-${episode.number}`),
    ));

  const logMedia = useLogMedia();
  const pushRoute = usePushRoute();
  // The long-pressed row — kept (not nulled) while its sheet closes.
  const [pressed, setPressed] = useState<{
    season: NormalizedSeason;
    episode: NormalizedEpisode;
  } | null>(null);
  const pointer: EpisodePointer | null =
    pressed == null
      ? null
      : { season: pressed.season.number, number: pressed.episode.number, episode: pressed.episode };
  const [actionsOpen, setActionsOpen] = useState(false);
  const [pending, setPending] = useState<PendingLog | null>(null);
  const [watchedAt, setWatchedAt] = useState<Date | null>(null);
  // Diary tags — accepted by Serializd's TV diary payload (plan 0017 R10). The
  // confirm sheet only surfaces the field when Serializd is a selected target.
  const [tags, setTags] = useState('');
  const [liked, setLiked] = useState(false);
  const [selectedProviders, setSelectedProviders] = useState<ProviderId[]>(targets);

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
    if (pending == null || logMedia.isPending) return;
    haptics.confirm();
    const parsedTags = parseTags(tags);
    logMedia.mutate(
      {
        item,
        // Canonical domain: this screen is Trakt's own season numbering.
        ...(pending.episodes != null ? { episodes: pending.episodes } : {}),
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

  function markEpisode(s: NormalizedSeason, episode: NormalizedEpisode) {
    openLog({
      title: `Log ${episodeCode(s.number, episode.number)}`,
      description: `“${item.title}” — ${episodeCode(s.number, episode.number)}: ${episode.title}`,
      episodes: [{ season: s.number, number: episode.number }],
    });
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
              errorToast={{ title: 'Episodes unavailable', message: 'The season list didn’t load — pull to refresh to try again.' }}
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
          onOpenEpisode: (s, episode) =>
            pushRoute(routes.episode(item.id, s.number, episode.number)),
          onMarkSeason: (s) => {
            // Never include unaired episodes in a season-wide mark — the
            // confirm sheet must not promise to log episodes the user couldn't
            // have watched yet (has-aired.ts timezone-correct comparison).
            const aired = s.episodes.filter((e) => hasAired(e.firstAired));
            if (aired.length === 0) return;
            openLog({
              title: `Log ${s.title}`,
              // The subject and the size of it — the title already carried the
              // verb, and the count is the fact the sheet couldn't otherwise
              // give: how many writes this one press is about to make.
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
          // The confirm sheet replaces this one rather than stacking on it.
          setActionsOpen(false);
          markEpisode(pressed.season, pressed.episode);
        }}
        open={actionsOpen}
        pointer={pointer}
        watched={
          pointer != null && watchedKeys?.has(`${pointer.season}-${pointer.number}`) === true
        }
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

/** TV detail list, source-routed to Trakt with BYO credentials or TMDB otherwise. */
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
  return (
    <ShowDetailsList {...layout} item={item} resetKey={resetKey} source={source} />
  );
}
