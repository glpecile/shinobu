import { useState } from 'react';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { MorphText } from '@/components/morph-text';
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
import { manualLinkForOutcome } from './manual-log-links';
import { parseTags } from './parse-tags';
import { OutcomeLink } from './outcome-link';
import { useLogMedia } from './use-log-media';
import { useLogTargetsSplit } from './use-log-targets';
import { confirmLabelFor, labels, LogConfirmSheet } from './log-confirm-sheet';

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
// Letterboxd diary tag stamped on every log by default, so Shinobu-made
// entries are filterable on Letterboxd. Prefilled, not forced — the field
// stays editable per log. The trailing separator leaves the cursor ready
// for the next tag; the parse filters the empty segment it creates.
const DEFAULT_TAGS = 'shinobu, ';

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
  const [tags, setTags] = useState(DEFAULT_TAGS);
  const { writable: targets, manual: manualTargets } = useLogTargetsSplit(item);
  const [selectedProviders, setSelectedProviders] = useState(targets);
  const accent = useCSSVariable('--color-accent');
  const accentColor = typeof accent === 'string' ? accent : undefined;

  const isFilmLike =
    item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
  const isAnimeSeries = item.type === 'ANIME' && item.isFilm !== true;
  // A manual-only target (e.g. Letterboxd on web) still needs the button and
  // its "log manually" row (plan 0022 R3) — only hide when there's truly
  // nothing to offer.
  if (
    (!isFilmLike && !isAnimeSeries) ||
    (targets.length === 0 && manualTargets.length === 0)
  ) {
    return null;
  }

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
    const parsedTags = parseTags(tags);
    logMedia.mutate(
      {
        item,
        ...(isAnimeSeries
          ? { episode: { season: 1, number: nextEpisode } }
          : {}),
        ...(watchedAt != null ? { watchedAt: watchedAt.toISOString() } : {}),
        ...(parsedTags.length > 0 ? { tags: parsedTags } : {}),
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
          setTags(DEFAULT_TAGS);
          setSelectedProviders(targets);
          setOpen(true);
        }}
      >
        {/* self-center (not text-center): the morph span shrink-wraps, so it
            must center as a flex item, not align text inside a full-width box. */}
        <MorphText className="text-accent-foreground font-sans-semibold text-base self-center">
          {buttonLabel}
        </MorphText>
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
        <View className="mt-2 gap-1">
          <Text className="text-accent font-sans text-sm">
            Failed on {labels(result.failed)}.
          </Text>
          {result.outcomes
            .filter((outcome) => outcome.status === 'error')
            .map((outcome) => {
              const link = manualLinkForOutcome(outcome, item);
              return link != null ? (
                <OutcomeLink
                  accentColor={accentColor}
                  key={outcome.provider}
                  provider={outcome.provider}
                  url={link}
                />
              ) : null;
            })}
        </View>
      )}

      <LogConfirmSheet
        onClose={() => setOpen(false)}
        confirmLabel={confirmLabelFor(
          isAnimeSeries
            ? `Log episode ${nextEpisode}`
            : isRewatch
              ? 'Log rewatch'
              : 'Log watch',
          selectedProviders,
        )}
        description={
          isAnimeSeries
            ? `Log episode ${nextEpisode} of “${item.title}”.`
            : isRewatch
              ? `“${item.title}” is already in your history — this logs another watch.`
              : `Mark “${item.title}” as watched.`
        }
        item={item}
        logMedia={logMedia}
        manualTargets={manualTargets}
        onConfirm={confirmLog}
        onSelectedProvidersChange={setSelectedProviders}
        onTagsChange={setTags}
        onWatchedAtChange={setWatchedAt}
        open={open}
        tags={tags}
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
