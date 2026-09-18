import { useRouter } from 'expo-router';
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
import { routes } from '@/lib/routes';
import { hasAired } from '@/lib/time/has-aired';
import { toast } from '@/lib/toast';
import type { NormalizedEpisode, NormalizedMediaItem } from '@/types/media';

import { episodeCode } from './episode-label';
import type { EpisodeRef } from './episode-neighbours';

/**
 * The episode screen's own log action — the same per-episode intent the
 * seasons accordion fires (`show-seasons/seasons-section.tsx` `markEpisode`):
 * one canonical `{season, number}` through the shared confirm sheet, which is
 * where a partial outcome stays readable with its manual links. A clean log
 * steps on to `next`; the last episode flips to Rewatch instead.
 */
export function EpisodeLogButton({
  item,
  season,
  number,
  episode,
  watched,
  next,
  className,
}: {
  item: NormalizedMediaItem;
  season: number;
  number: number;
  episode: NormalizedEpisode;
  watched: boolean;
  next: EpisodeRef | undefined;
  className?: string;
}) {
  const router = useRouter();
  const logMedia = useLogMedia();
  const { writable: targets, manual: manualTargets } = useLogTargetsSplit(item);
  const [open, setOpen] = useState(false);
  const [watchedAt, setWatchedAt] = useState<Date | null>(null);
  const [tags, setTags] = useState('');
  const [selectedProviders, setSelectedProviders] = useState<ProviderId[]>(targets);
  // Provider reads lag a write (AniList/Serializd never feed `watched`); keyed
  // by code so it can't carry over if `replace` reuses this instance.
  const [loggedCode, setLoggedCode] = useState<string | null>(null);
  if (targets.length === 0 && manualTargets.length === 0) return null;

  const code = episodeCode(season, number);
  const aired = hasAired(episode.firstAired);
  const seen = watched || loggedCode === code;
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
            setLoggedCode(code);
            // `replace`, like `EpisodeNav`: back still returns to the show.
            if (next != null) router.replace(routes.episode(item.id, next.season, next.number));
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
        icon={<Button.Icon name={seen ? 'eye' : 'eye-outline'} />}
        label={
          aired
            ? seen
              ? 'Rewatch'
              : 'Mark as watched'
            : unairedEpisodeLabel(code, episode.firstAired)
        }
        loading={logMedia.isPending}
        morphLabel
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
