import { useState } from 'react';
import { Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { haptics } from '@/lib/haptics';
import { useAniListEntryStateQuery } from '@/state/queries/anilist';
import { useTraktWatchedInfo } from '@/state/queries/trakt';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';
import { useLogMedia } from './use-log-media';
import { useLogTargets } from './use-log-targets';
import { labels, LogConfirmSheet } from './log-confirm-sheet';

/**
 * The movie/anime log trigger (plans 0008 + 0011). A write to external
 * trackers shouldn't ride on one stray tap, so the button only *opens* a
 * confirmation sheet (`LogConfirmSheet` — shared with the TV season picker,
 * plan 0010); the actual mutation fires from the sheet's confirm action, with
 * haptic feedback on commit/success/failure. Renders for items loggable
 * without a season choice — movies, anime films, and anime *series* (whose
 * natural log unit is "next episode": AniList entries are per-season, plan
 * 0011); TV uses the season picker.
 */
export function LogMediaButton({ item }: { item: NormalizedMediaItem }) {
  const connected = useConnectedProviders();
  const logMedia = useLogMedia();
  const traktWatched = useTraktWatchedInfo(item);
  const anilistEntry = useAniListEntryStateQuery({
    mediaId: item.externalIds.anilist,
    enabled: connected.includes('anilist'),
  });
  const [open, setOpen] = useState(false);
  const [watchedAt, setWatchedAt] = useState<Date | null>(null);
  const targets = useLogTargets(item);

  const isFilmLike =
    item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
  const isAnimeSeries = item.type === 'ANIME' && item.isFilm !== true;
  if ((!isFilmLike && !isAnimeSeries) || targets.length === 0) return null;

  const anilistStatus = anilistEntry.data?.entry?.status;
  const isRewatch =
    traktWatched != null ||
    anilistStatus === 'COMPLETED' ||
    anilistStatus === 'REPEATING';

  // Anime series log the next unwatched episode; a completed series starts
  // its rewatch back at episode 1 (AniList: REPEATING, progress resets).
  const total = item.totalEpisodes;
  const nextEpisode =
    total != null && item.currentProgress >= total
      ? 1
      : item.currentProgress + 1;

  const result = logMedia.data;

  function confirmLog() {
    if (logMedia.isPending) return;
    haptics.confirm();
    logMedia.mutate(
      {
        item,
        ...(isAnimeSeries
          ? { episode: { season: 1, number: nextEpisode } }
          : {}),
        ...(watchedAt != null ? { watchedAt: watchedAt.toISOString() } : {}),
      },
      {
        onSuccess: (outcome) => {
          if (outcome.failed.length === 0) {
            haptics.success();
            setOpen(false);
          } else {
            haptics.error();
          }
        },
        onError: () => haptics.error(),
      },
    );
  }

  const buttonLabel = isAnimeSeries
    ? `Log episode ${nextEpisode}`
    : isRewatch
      ? 'Log rewatch'
      : 'Mark as watched';

  return (
    <View className="mb-6">
      <PresstableOpacity
        className="bg-accent rounded px-5 py-3"
        onPress={() => {
          haptics.selection();
          logMedia.reset();
          setWatchedAt(null);
          setOpen(true);
        }}
      >
        <Text className="text-accent-foreground font-sans-semibold text-base text-center">
          {buttonLabel}
        </Text>
      </PresstableOpacity>
      {result != null && result.succeeded.length > 0 && (
        <Text className="text-muted font-sans text-sm mt-2">
          {result.rewatch ? 'Logged rewatch to' : 'Logged to'}{' '}
          {labels(result.succeeded)}.
          {result.skipped.length > 0 &&
            ` ${labels(result.skipped)} already had it.`}
        </Text>
      )}
      {result != null && result.failed.length > 0 && (
        <Text className="text-accent font-sans text-sm mt-2">
          Failed on {labels(result.failed)}.
        </Text>
      )}

      <LogConfirmSheet
        onClose={() => setOpen(false)}
        confirmLabel={
          isAnimeSeries
            ? `Log episode ${nextEpisode} on ${labels(targets)}`
            : isRewatch
              ? `Log rewatch on ${labels(targets)}`
              : `Log watch on ${labels(targets)}`
        }
        description={
          isAnimeSeries
            ? `Log episode ${nextEpisode} of “${item.title}”.`
            : isRewatch
              ? `“${item.title}” is already in your history — this logs another watch.`
              : `Mark “${item.title}” as watched.`
        }
        logMedia={logMedia}
        onConfirm={confirmLog}
        onWatchedAtChange={setWatchedAt}
        open={open}
        pendingLabel="Logging…"
        targets={targets}
        title={
          isAnimeSeries
            ? `Log episode ${nextEpisode}`
            : isRewatch
              ? 'Log rewatch'
              : 'Log watch'
        }
        watchedAt={watchedAt}
      />
    </View>
  );
}
