import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { LogConfirmSheet } from '@/features/log-media/log-confirm-sheet';
import { parseTags } from '@/features/log-media/parse-tags';
import { unairedEpisodeLabel } from '@/features/log-media/series-next-episode';
import { logToastCopy } from '@/features/log-media/toast-copy';
import { useLogMedia } from '@/features/log-media/use-log-media';
import { useLogTargetsSplit } from '@/features/log-media/use-log-targets';
import { isCleanWriteReport } from '@/features/write-sheet/is-clean-report';
import { haptics } from '@/lib/haptics';
import type { ProviderId } from '@/lib/providers/types';
import { hasAired } from '@/lib/time/has-aired';
import { toast } from '@/lib/toast';
import type { NormalizedEpisode, NormalizedMediaItem } from '@/types/media';

import { episodeCode } from './episode-label';

/**
 * The episode screen's own log action — the same per-episode intent the
 * seasons accordion fires (`show-seasons/seasons-section.tsx` `markEpisode`):
 * one canonical `{season, number}` through the shared confirm sheet, which is
 * where a partial outcome stays readable with its manual links.
 */
export function EpisodeLogButton({
  item,
  season,
  number,
  episode,
  watched,
  className,
}: {
  item: NormalizedMediaItem;
  season: number;
  number: number;
  episode: NormalizedEpisode;
  watched: boolean;
  className?: string;
}) {
  const logMedia = useLogMedia();
  const { writable: targets, manual: manualTargets } = useLogTargetsSplit(item);
  const [open, setOpen] = useState(false);
  const [watchedAt, setWatchedAt] = useState<Date | null>(null);
  const [tags, setTags] = useState('');
  const [selectedProviders, setSelectedProviders] = useState<ProviderId[]>(targets);
  if (targets.length === 0 && manualTargets.length === 0) return null;

  const code = episodeCode(season, number);
  const aired = hasAired(episode.firstAired);
  const title = `Log ${code}`;

  function confirmLog() {
    if (logMedia.isPending) return;
    haptics.confirm();
    const parsedTags = parseTags(tags);
    logMedia.mutate(
      {
        item,
        episodes: [{ season, number }],
        ...(watchedAt != null ? { watchedAt: watchedAt.toISOString() } : {}),
        ...(parsedTags.length > 0 ? { tags: parsedTags } : {}),
        providers: selectedProviders,
      },
      {
        onSuccess: (outcome) => {
          if (isCleanWriteReport(outcome)) {
            const copy = logToastCopy(outcome);
            toast.success(copy.title, copy.message);
            setOpen(false);
          } else if (outcome.failed.length > 0) {
            haptics.error();
          }
        },
        onError: () => haptics.error(),
      },
    );
  }

  return (
    <View className={className}>
      <Button
        disabled={!aired}
        icon={<Button.Icon name={watched ? 'eye' : 'eye-outline'} />}
        label={
          aired
            ? watched
              ? 'Rewatch'
              : 'Mark as watched'
            : unairedEpisodeLabel(code, episode.firstAired)
        }
        loading={logMedia.isPending}
        onPress={() => {
          haptics.selection();
          logMedia.reset();
          setWatchedAt(null);
          setTags('');
          setSelectedProviders(targets);
          setOpen(true);
        }}
      />
      <LogConfirmSheet
        confirmLabel={title}
        description={`“${item.title}” — ${code}: ${episode.title}`}
        item={item}
        logMedia={logMedia}
        manualTargets={manualTargets}
        onClose={() => setOpen(false)}
        onConfirm={confirmLog}
        onSelectedProvidersChange={setSelectedProviders}
        onTagsChange={setTags}
        onWatchedAtChange={setWatchedAt}
        open={open}
        pendingLabel="Logging…"
        selectedProviders={selectedProviders}
        tags={tags}
        targets={targets}
        title={title}
        watchedAt={watchedAt}
      />
    </View>
  );
}
