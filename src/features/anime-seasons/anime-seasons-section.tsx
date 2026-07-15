import { Text, View } from 'react-native';
import { useState } from 'react';

import { Skeleton } from '@/components/skeleton';
import { SuspenseSection } from '@/components/suspense-section';
import { haptics } from '@/lib/haptics';
import type { ProviderId } from '@/lib/providers/types';
import { hasAired } from '@/lib/time/has-aired';
import {
  confirmLabelFor,
  LogConfirmSheet,
} from '@/features/log-media/log-confirm-sheet';
import { useLogMedia } from '@/features/log-media/use-log-media';
import { useLogTargets } from '@/features/log-media/use-log-targets';
import {
  SeasonAccordion,
  type PendingLog,
} from '@/features/show-seasons/season-accordion';
import {
  formatRuntime,
  seasonRuntimeMinutes,
} from '@/features/show-seasons/runtime';
import {
  useAniListEntryStateQuery,
  useSuspenseAniListEpisodesQuery,
} from '@/state/queries/anilist';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

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

function watchedKeys(progress: number): ReadonlySet<string> {
  const keys = new Set<string>();
  for (let number = 1; number <= progress; number++) {
    keys.add(`1-${number}`);
  }
  return keys;
}

function AnimeSeasonAccordionList({ item }: { item: NormalizedMediaItem }) {
  const mediaId = item.externalIds.anilist!;
  const { data: season } = useSuspenseAniListEpisodesQuery({ mediaId });
  const connected = useConnectedProviders();
  const { data: entryState } = useAniListEntryStateQuery({
    mediaId,
    enabled: connected.includes('anilist'),
  });
  const targets = useLogTargets(item);
  const canLog = targets.length > 0;

  const logMedia = useLogMedia();
  const [pending, setPending] = useState<PendingLog | null>(null);
  const [watchedAt, setWatchedAt] = useState<Date | null>(null);
  const [selectedProviders, setSelectedProviders] =
    useState<ProviderId[]>(targets);

  const progress = entryState?.entry?.progress ?? item.currentProgress;
  const watched = watchedKeys(progress);

  function openLog(next: PendingLog) {
    if (!canLog) return;
    haptics.selection();
    logMedia.reset();
    setWatchedAt(null);
    setSelectedProviders(targets);
    setPending(next);
  }

  function confirmLog() {
    if (pending == null || logMedia.isPending || selectedProviders.length === 0)
      return;
    haptics.confirm();
    logMedia.mutate(
      {
        item,
        episodes: pending.episodes,
        ...(watchedAt != null ? { watchedAt: watchedAt.toISOString() } : {}),
        providers: selectedProviders,
      },
      {
        onSuccess: (outcome) => {
          if (outcome.failed.length === 0) {
            haptics.success();
            setPending(null);
          } else {
            haptics.error();
          }
        },
        onError: () => haptics.error(),
      },
    );
  }

  const runtime = seasonRuntimeMinutes(season);

  return (
    <View className="mt-8">
      <Text className="text-xl font-display text-foreground mb-1">Seasons</Text>
      {runtime > 0 && (
        <Text className="text-muted font-sans text-sm mb-4">
          {formatRuntime(runtime)} total runtime
        </Text>
      )}
      <SeasonAccordion
        season={season}
        watched={watched}
        onMarkEpisode={(s, episode) =>
          openLog({
            title: 'Mark episode as watched',
            description: `“${item.title}” — ${s.title}, E${episode.number}: ${episode.title}`,
            episodes: [{ season: s.number, number: episode.number }],
          })
        }
        onMarkSeason={(s) => {
          // Same unaired guard as the Trakt season picker.
          const aired = s.episodes.filter((e) => hasAired(e.firstAired));
          if (aired.length === 0) return;
          openLog({
            title: `Mark ${s.title} as watched`,
            description: `Mark every aired episode of ${s.title} of “${item.title}” as watched.`,
            episodes: aired.map((episode) => ({
              season: s.number,
              number: episode.number,
            })),
          });
        }}
      />

      <LogConfirmSheet
        confirmLabel={confirmLabelFor('Mark as watched', selectedProviders)}
        description={pending?.description ?? ''}
        logMedia={logMedia}
        onClose={() => setPending(null)}
        onConfirm={confirmLog}
        onSelectedProvidersChange={setSelectedProviders}
        onWatchedAtChange={setWatchedAt}
        open={pending != null}
        pendingLabel="Marking as watched…"
        selectedProviders={selectedProviders}
        targets={targets}
        title={pending?.title ?? ''}
        watchedAt={watchedAt}
      />
    </View>
  );
}

/**
 * Anime-series-only section for the detail screen. Mirrors the TV
 * `SeasonsSection` layout (plan 0010) so anime details don't feel like a
 * separate, stripped-down page. Episodes come from AniList's airing schedule
 * + streaming metadata; watched checkmarks come from the live entry progress.
 */
export function AnimeSeasonsSection({
  item,
  resetKey,
}: {
  item: NormalizedMediaItem;
  resetKey?: unknown;
}) {
  if (item.type !== 'ANIME' || item.isFilm === true) return null;
  if (item.externalIds.anilist == null) return null;

  return (
    <SuspenseSection fallback={<SeasonsSkeleton />} resetKey={resetKey}>
      <AnimeSeasonAccordionList item={item} />
    </SuspenseSection>
  );
}
