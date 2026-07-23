import { Text, View } from 'react-native';

import { SuspenseSection } from '@/components/suspense-section';
import { Skeleton } from '@/components/skeleton';
import { haptics } from '@/lib/haptics';
import { hasAired } from '@/lib/time/has-aired';
import {
  useSuspenseTraktShowSeasonsQuery,
  useTraktShowProgressQuery,
} from '@/state/queries/trakt';
import { useConnectedProviders } from '@/state/session';
import { useState } from 'react';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';
import { useLogMedia } from '@/features/log-media/use-log-media';
import { useLogTargetsSplit } from '@/features/log-media/use-log-targets';
import { confirmLabelFor, LogConfirmSheet } from '@/features/log-media/log-confirm-sheet';
import { parseTags } from '@/features/log-media/parse-tags';
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
function SeasonAccordionList({ item }: { item: NormalizedMediaItem }) {
  const traktId = item.externalIds.trakt!;
  const connected = useConnectedProviders();
  const { data: seasons } = useSuspenseTraktShowSeasonsQuery({ traktId });
  // Enrichment-aware: a reverse-mapped anime TV show shows AniList too.
  const { writable: targets, manual: manualTargets } = useLogTargetsSplit(item);
  const canLog = targets.length > 0;
  // No progress read when Trakt isn't connected — checkmarks just don't render.
  const { data: watched } = useTraktShowProgressQuery({
    traktId,
    enabled: connected.includes('trakt'),
  });

  const logMedia = useLogMedia();
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
        episodes: pending.episodes,
        ...(watchedAt != null ? { watchedAt: watchedAt.toISOString() } : {}),
        ...(parsedTags.length > 0 ? { tags: parsedTags } : {}),
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

  const total = seriesRuntimeMinutes(seasons);

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
          onMarkEpisode={(s, episode) =>
            openLog({
              title: 'Mark episode as watched',
              description: `“${item.title}” — ${s.title}, E${episode.number}: ${episode.title}`,
              episodes: [{ season: s.number, number: episode.number }],
            })
          }
          onMarkSeason={(s) => {
            // Never include unaired episodes in a season-wide mark — the
            // confirm sheet must not promise to log episodes the user couldn't
            // have watched yet (has-aired.ts timezone-correct comparison).
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
          season={season}
          watched={watched?.watchedKeys ?? null}
        />
      ))}

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
 * TV-only section for the detail screen (plan 0010). Wraps the season list in
 * a `SuspenseSection` so the seasons fetch never blocks the hero/poster/
 * overview above it; the rest of the screen lands first, the accordions drop
 * in once Trakt responds.
 */
export function SeasonsSection({ item }: { item: NormalizedMediaItem }) {
  if (item.externalIds.trakt == null) return null;
  return (
    <SuspenseSection fallback={<SeasonsSkeleton />}>
      <SeasonAccordionList item={item} />
    </SuspenseSection>
  );
}