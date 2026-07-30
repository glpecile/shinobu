import { Text, View } from 'react-native';
import { useState } from 'react';

import { Skeleton } from '@/components/skeleton';
import { SuspenseSection } from '@/components/suspense-section';
import { isCleanWriteReport } from '@/features/write-sheet/is-clean-report';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import type { ProviderId } from '@/lib/providers/types';
import { hasAired } from '@/lib/time/has-aired';
import {
  confirmLabelFor,
  LogConfirmSheet,
} from '@/features/log-media/log-confirm-sheet';
import { useLogMedia } from '@/features/log-media/use-log-media';
import { useLogTargetsSplit } from '@/features/log-media/use-log-targets';
import { parseTags } from '@/features/log-media/parse-tags';
import { logToastCopy } from '@/features/log-media/toast-copy';
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
import { useAniZipEpisodeMapQuery } from '@/state/queries/mapping';
import { useConnectedProviders } from '@/state/session';
import { canonicalSeasonTitle } from './season-label';
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

function AnimeSeasonAccordionList({ item }: { item: NormalizedMediaItem }) {
  const mediaId = item.externalIds.anilist!;
  const { data: season } = useSuspenseAniListEpisodesQuery({ mediaId });
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
    canonicalTitle == null ? season : { ...season, title: canonicalTitle };

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
      },
      {
        onSuccess: (outcome) => {
          // Clean → toast + close; anything left to read keeps the sheet open
          // (plan 0032 R4/KTD-3). The toast wrapper owns the success haptic.
          if (isCleanWriteReport(outcome, manualTargets)) {
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
        season={labelled}
        watched={watched}
        onMarkEpisode={(_s, episode) =>
          openLog({
            title: 'Mark episode as watched',
            // The entry title already names the season ("… Season 2"), so the
            // episode line doesn't repeat it — and can't claim one when the
            // mapping is unknown.
            description: `“${item.title}” — E${episode.number}: ${episode.title}`,
            // Entry-relative (plan 0027): the number the AniList entry itself
            // uses. The header may read "Season 2", but what gets logged is
            // episode N *of this entry* — the fan-out maps it to a canonical
            // season, and a mapping miss becomes an honest skip.
            entryEpisodes: [episode.number],
          })
        }
        onMarkSeason={(s) => {
          // Same unaired guard as the Trakt season picker.
          const aired = s.episodes.filter((e) => hasAired(e.firstAired));
          if (aired.length === 0) return;
          const label = canonicalTitle ?? 'all episodes';
          openLog({
            title: `Mark ${label} as watched`,
            description: `Mark every aired episode of “${item.title}” as watched.`,
            entryEpisodes: aired.map((episode) => episode.number),
          });
        }}
      />

      <LogConfirmSheet
        confirmLabel={confirmLabelFor('Mark as watched', selectedProviders)}
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
        pendingLabel="Marking as watched…"
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
