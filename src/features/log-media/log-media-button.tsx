import { useState } from 'react';
import { Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { haptics } from '@/lib/haptics';
import { hasAired } from '@/lib/time/has-aired';
import {
  useAniListEntryStateQuery,
  useAniListEpisodesQuery,
} from '@/state/queries/anilist';
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
  const anilistEpisodes = useAniListEpisodesQuery({
    mediaId: item.externalIds.anilist,
    enabled: item.type === 'ANIME' && item.externalIds.anilist != null,
  });
  const [open, setOpen] = useState(false);
  const [watchedAt, setWatchedAt] = useState<Date | null>(null);
  const targets = useLogTargets(item);
  const [selectedProviders, setSelectedProviders] = useState(targets);

  const isFilmLike =
    item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
  const isAnimeSeries = item.type === 'ANIME' && item.isFilm !== true;
  if ((!isFilmLike && !isAnimeSeries) || targets.length === 0) return null;

  const anilistStatus = anilistEntry.data?.entry?.status;
  const anilistProgress = anilistEntry.data?.entry?.progress;
  const isRewatch =
    traktWatched != null ||
    anilistStatus === 'COMPLETED' ||
    anilistStatus === 'REPEATING';

  // Anime series log the next unwatched episode. Prefer the live AniList
  // entry progress over the feed's cached progress, so a detail screen opened
  // from trending still recognizes already-watched episodes.
  const total = item.totalEpisodes;
  const currentProgress = anilistProgress ?? item.currentProgress;
  const nextEpisode =
    total != null && currentProgress >= total ? 1 : currentProgress + 1;

  // Never offer to log an episode that hasn't aired yet (todos/006).
  // Only evaluate aired status once the episodes query has successfully loaded.
  // While loading/pending/error, treat as not aired (disable button).
  // Once loaded:
  // - Episode not in schedule → not aired (new anime, episode not yet scheduled)
  // - Episode in schedule but no air date → aired (catalogue entry)
  // - Episode in schedule with air date → use hasAired
  const episodeData = anilistEpisodes.data?.episodes.find(
    (e) => e.number === nextEpisode,
  );
  const nextEpisodeAired =
    !isAnimeSeries ||
    (anilistEpisodes.status === 'success' &&
      anilistEpisodes.data != null &&
      (episodeData == null
        ? false
        : episodeData.firstAired == null
          ? true
          : hasAired(episodeData.firstAired)));

  const result = logMedia.data;

  function confirmLog() {
    if (logMedia.isPending || selectedProviders.length === 0) return;
    haptics.confirm();
    logMedia.mutate(
      {
        item,
        ...(isAnimeSeries
          ? { episode: { season: 1, number: nextEpisode } }
          : {}),
        ...(watchedAt != null ? { watchedAt: watchedAt.toISOString() } : {}),
        providers: selectedProviders,
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
    ? nextEpisodeAired
      ? `Log episode ${nextEpisode}`
      : `Episode ${nextEpisode} not yet aired`
    : isRewatch
      ? 'Log rewatch'
      : 'Mark as watched';

  return (
    <View className="mb-6">
      <PresstableOpacity
        className={`rounded px-5 py-3 ${
          nextEpisodeAired ? 'bg-accent' : 'bg-accent/40'
        }`}
        onPress={() => {
          if (!nextEpisodeAired) return;
          haptics.selection();
          logMedia.reset();
          setWatchedAt(null);
          setSelectedProviders(targets);
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
            ? `Log episode ${nextEpisode} on ${labels(selectedProviders)}`
            : isRewatch
              ? `Log rewatch on ${labels(selectedProviders)}`
              : `Log watch on ${labels(selectedProviders)}`
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
        onSelectedProvidersChange={setSelectedProviders}
        onWatchedAtChange={setWatchedAt}
        open={open}
        pendingLabel="Logging…"
        selectedProviders={selectedProviders}
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
