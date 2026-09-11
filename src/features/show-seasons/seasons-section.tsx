import { Text, View } from 'react-native';

import { SuspenseSection } from '@/components/suspense-section';
import { Skeleton } from '@/components/skeleton';
import { isCleanWriteReport } from '@/features/write-sheet/is-clean-report';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { hasAired } from '@/lib/time/has-aired';
import {
  useShowSeasonsSource,
  useSuspenseShowSeasonsQuery,
  type ShowSeasonsSource,
} from '@/state/queries/show-seasons';
import { useSimklLibraryEntryQuery } from '@/state/queries/simkl';
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
import { SeasonAccordion, type PendingLog } from './season-accordion';
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

/**
 * The accordion list itself — a separate component so the suspense boundary
 * (fired by the seasons query) wraps only the part that needs the data; the
 * detail screen renders `<SeasonsSection item={item} />` which carries the
 * boundary + skeleton.
 */
function SeasonAccordionList({
  item,
  source,
}: {
  item: NormalizedMediaItem;
  source: ShowSeasonsSource;
}) {
  const traktId = item.externalIds.trakt;
  const connected = useConnectedProviders();
  const { data: seasons } = useSuspenseShowSeasonsQuery(source);
  // Enrichment-aware: a reverse-mapped anime TV show shows AniList too.
  const { writable: targets, manual: manualTargets } = useLogTargetsSplit(item);
  // A manual-only target still needs the sheet openable (plan 0022 R3) —
  // matches LogMediaButton's gate.
  const canLog = targets.length > 0 || manualTargets.length > 0;
  // Watched checkmarks from whichever tracker knows: Trakt's progress read
  // first, else the Simkl `watching` snapshot's per-episode keys (the same
  // `"${season}-${number}"` format). Neither connected → no checkmarks.
  const { data: traktWatched } = useTraktShowProgressQuery({
    traktId: traktId ?? undefined,
    enabled: connected.includes('trakt') && traktId != null,
  });
  const { data: simklEntry } = useSimklLibraryEntryQuery({
    item,
    enabled: connected.includes('simkl'),
  });
  // A `completed` Simkl entry carries **no** `seasons[]` array at all — the
  // API omits per-episode detail once a show is finished (verified on Doctor
  // Who: `status: 'completed'`, `watched_episodes_count: 153`,
  // `watchedEpisodes: []`). Reading its empty key set literally left every
  // episode of a fully-watched series showing an unticked "Mark as watched"
  // (owner report 2026-08-01). "Completed" *means* every aired episode, so the
  // layout on screen is the key set — aired only, because ticking an episode
  // that hasn't come out yet would be a worse lie than the missing tick.
  const simklWatchedAll =
    simklEntry?.status === 'completed' && simklEntry.watchedKeys.size === 0;
  const watchedKeys =
    traktWatched?.watchedKeys ??
    (simklWatchedAll
      ? new Set(
          seasons.flatMap((season) =>
            season.episodes
              .filter((episode) => hasAired(episode.firstAired))
              .map((episode) => `${season.number}-${episode.number}`),
          ),
        )
      : simklEntry?.watchedKeys) ??
    null;

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
  const [selectedProviders, setSelectedProviders] = useState<ProviderId[]>(targets);

  function openLog(next: PendingLog) {
    if (!canLog) return;
    haptics.selection();
    logMedia.reset();
    setWatchedAt(null);
    setTags('');
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

  const total = seriesRuntimeMinutes(seasons);

  function markEpisode(s: NormalizedSeason, episode: NormalizedEpisode) {
    openLog({
      title: `Log ${episodeCode(s.number, episode.number)}`,
      description: `“${item.title}” — ${episodeCode(s.number, episode.number)}: ${episode.title}`,
      episodes: [{ season: s.number, number: episode.number }],
    });
  }

  return (
    <View className="mt-8">
      <Text className="text-xl font-display text-foreground mb-1">Seasons</Text>
      {total > 0 && (
        <Text className="text-muted font-sans text-sm mb-4">
          {formatRuntime(total)} total runtime
        </Text>
      )}
      {seasons.map((season) => (
        <SeasonAccordion
          key={season.number}
          onEpisodeActions={(s, episode) => {
            haptics.selection();
            setPressed({ season: s, episode });
            setActionsOpen(true);
          }}
          onMarkEpisode={markEpisode}
          onOpenEpisode={(s, episode) =>
            pushRoute(routes.episode(item.id, s.number, episode.number))
          }
          onMarkSeason={(s) => {
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
          }}
          season={season}
          watched={watchedKeys}
        />
      ))}

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
        onWatchedAtChange={setWatchedAt}
        open={pending != null}
        pendingLabel="Logging…"
        selectedProviders={selectedProviders}
        tags={tags}
        targets={targets}
        title={pending?.title ?? ''}
        watchedAt={watchedAt}
      />
    </View>
  );
}

/**
 * TV-only section for the detail screen (plan 0010). Wraps the season list in
 * a `SuspenseSection` so the seasons fetch never blocks the hero/poster/
 * overview above it; the rest of the screen lands first, the accordions drop
 * in once the catalogue answers. Source-routed (plan 0034): Trakt when its
 * BYO credentials exist, TMDB otherwise — so a Simkl-sourced show still gets
 * its episode list; hidden only when no catalogue can answer.
 */
export function SeasonsSection({
  item,
  resetKey,
}: {
  item: NormalizedMediaItem;
  resetKey?: unknown;
}) {
  const source = useShowSeasonsSource(item);
  if (source == null) return null;
  return (
    <SuspenseSection
      // Same rationale as AnimeSeasonsSection: a vanished season list reads
      // as "no episodes", so the failure gets named with its recourse.
      errorToast={{
        title: 'Episodes unavailable',
        message: 'The season list didn’t load — pull to refresh to try again.',
      }}
      fallback={<SeasonsSkeleton />}
      resetKey={resetKey}
    >
      <SeasonAccordionList item={item} source={source} />
    </SuspenseSection>
  );
}