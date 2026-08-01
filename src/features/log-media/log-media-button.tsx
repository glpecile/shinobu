import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { haptics } from '@/lib/haptics';
import { hasAired } from '@/lib/time/has-aired';
import {
  useAniListEntryStateQuery,
  useAniListEpisodesQuery,
} from '@/state/queries/anilist';
import { useWatchedInfo } from '@/state/queries/watched-info';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';
import { isCleanWriteReport } from '@/features/write-sheet/is-clean-report';
import { toast } from '@/lib/toast';
import { filmReleaseStatus } from './release-gate';
import { parseTags } from './parse-tags';
import { logToastCopy } from './toast-copy';
import { useLogMedia } from './use-log-media';
import { useLogTargetsSplit } from './use-log-targets';
import { seriesEpisodeLabel } from './series-next-episode';
import { useSeriesNextEpisode } from './use-series-next-episode';
import { confirmLabelFor, LogConfirmSheet } from './log-confirm-sheet';

/**
 * The movie/anime log trigger (plans 0008 + 0011). A write to external
 * trackers shouldn't ride on one stray tap, so the button only *opens* a
 * confirmation sheet (`LogConfirmSheet` — shared with the TV season picker,
 * plan 0010); the actual mutation fires from the sheet's confirm action, with
 * haptic feedback on commit/success/failure. Renders for every item with a
 * single obvious next log: movies, anime films, anime *series* (whose natural
 * log unit is "next episode": AniList entries are per-season, plan 0011) and
 * TV series, whose next episode comes from Trakt's watched-progress read.
 * A TV show whose next episode can't be named (Trakt disconnected, no Trakt
 * id, failed read) falls back to the details page's season picker.
 */
// Letterboxd diary tag stamped on every log by default, so Shinobu-made
// entries are filterable on Letterboxd. Prefilled, not forced — the field
// stays editable per log. The trailing separator leaves the cursor ready
// for the next tag; the parse filters the empty segment it creates.
const DEFAULT_TAGS = 'shinobu, ';

export function LogMediaButton({ item }: { item: NormalizedMediaItem }) {
  const connected = useConnectedProviders();
  const logMedia = useLogMedia();
  const watchedInfo = useWatchedInfo(item);
  const anilistEntry = useAniListEntryStateQuery({
    mediaId: item.externalIds.anilist,
    enabled: connected.includes('anilist'),
  });
  const anilistEpisodes = useAniListEpisodesQuery({
    mediaId: item.externalIds.anilist,
    enabled: item.type === 'ANIME' && item.externalIds.anilist != null,
  });
  const seriesNextState = useSeriesNextEpisode(item);
  const [open, setOpen] = useState(false);
  const [watchedAt, setWatchedAt] = useState<Date | null>(null);
  const [tags, setTags] = useState(DEFAULT_TAGS);
  const { writable: targets, manual: manualTargets } = useLogTargetsSplit(item);
  const [selectedProviders, setSelectedProviders] = useState(targets);

  const isFilmLike =
    item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
  const isAnimeSeries = item.type === 'ANIME' && item.isFilm !== true;
  const isSeries = item.type === 'TV';
  // A manual-only target (e.g. Letterboxd on web) still needs the button and
  // its "log manually" row (plan 0022 R3) — only hide when there's truly
  // nothing to offer.
  if (
    (!isFilmLike && !isAnimeSeries && !isSeries) ||
    (targets.length === 0 && manualTargets.length === 0) ||
    // Naming an episode is the whole affordance for a series: without one
    // there's nothing to put on the button, so the season picker takes over.
    (isSeries && seriesNextState.status === 'unavailable')
  ) {
    return null;
  }

  const seriesNext =
    seriesNextState.status === 'ready' ? seriesNextState.episode : null;
  const seriesLabel = seriesNext == null ? '' : seriesEpisodeLabel(seriesNext);
  // The one action the series button performs, reused by the confirm sheet's
  // title and confirm label so all three read identically. A finished show
  // says "rewatch" rather than naming S1E1 as if it were up next — the same
  // word the movie path uses for the same situation.
  const seriesAction =
    seriesNext == null
      ? 'Log next episode'
      : seriesNext.rewatch
        ? 'Log rewatch'
        : `Log ${seriesLabel}`;
  // The series analogue of `filmReleaseStatus` (plan 0035 R18). A show with
  // zero aired episodes shares Trakt's `next_episode: null` with a *finished*
  // show, and used to be rendered as one: "🎉 You've watched every aired
  // episode" over a "Log rewatch" button, for something nobody has seen. The
  // 🎉 line and the rewatch copy below both gate on `rewatch`, which stays
  // false here, so they disappear on their own.
  const seriesUnaired = seriesNext?.unaired === true;

  const anilistStatus = anilistEntry.data?.entry?.status;
  const anilistProgress = anilistEntry.data?.entry?.progress;
  const isRewatch =
    watchedInfo != null ||
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

  // The movie counterpart of that gate: a film that isn't out yet can't be
  // watched, so it can't be logged — and unlike the episode rule above, an
  // *unknown* release date blocks too (see `filmReleaseStatus`).
  const releaseStatus = isFilmLike ? filmReleaseStatus(item) : 'released';
  const released = releaseStatus === 'released';
  // Same gate on the TV side, from Trakt's air date rather than AniList's.
  const seriesEpisodeAired = !isSeries || seriesNext?.aired === true;
  const canLog = nextEpisodeAired && released && seriesEpisodeAired;

  const result = logMedia.data;

  function confirmLog() {
    if (logMedia.isPending || selectedProviders.length === 0) return;
    if (isSeries && seriesNext == null) return;
    haptics.confirm();
    const parsedTags = parseTags(tags);
    logMedia.mutate(
      {
        item,
        // Entry-relative, no season (plan 0027 KTD2): `nextEpisode` counts the
        // AniList entry's own episodes, and the fan-out resolves the canonical
        // season from ani.zip before Trakt/Serializd see it.
        ...(isAnimeSeries ? { entryEpisodes: [nextEpisode] } : {}),
        // Canonical domain, exactly like the season picker: Trakt's own
        // season/episode numbering, which is where this episode came from.
        ...(isSeries && seriesNext != null
          ? { episodes: [{ season: seriesNext.season, number: seriesNext.number }] }
          : {}),
        ...(watchedAt != null ? { watchedAt: watchedAt.toISOString() } : {}),
        ...(parsedTags.length > 0 ? { tags: parsedTags } : {}),
        providers: selectedProviders,
      },
      {
        onSuccess: (outcome) => {
          // Clean → toast + close; post-write news (a failure, a reasoned
          // skip) keeps the sheet open rendering it (plan 0032 R4/KTD-3).
          // Upfront manual rows don't block — they were on the sheet before
          // confirm (plan 0033 R1). The toast wrapper owns the success haptic.
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

  const buttonLabel = isSeries
    ? seriesUnaired
      ? // Not "S1E1 not yet aired": nothing at all has aired, so naming an
        // episode implies a schedule the show doesn't have yet.
        'Hasn’t aired yet'
      : seriesNext == null || seriesNext.rewatch
        ? seriesAction
        : seriesNext.aired
          ? `Log ${seriesLabel}`
          : `${seriesLabel} not yet aired`
    : isAnimeSeries
      ? nextEpisodeAired
        ? `Log episode ${nextEpisode}`
        : `Episode ${nextEpisode} not yet aired`
      : releaseStatus === 'unknown'
        ? 'No release date yet'
        : releaseStatus === 'unreleased'
          ? 'Not yet released'
          : isRewatch
            ? 'Log rewatch'
            : 'Mark as watched';

  return (
    // `mb-3`, not `mb-6`: the want-to-watch CTA renders directly beneath this
    // at both call sites (details screen, card sheet) and the two belong to one
    // item. At 24px they read as unrelated blocks; at 12px they read as two
    // options, and the watchlist button's own `mb-6` still separates the pair
    // from whatever follows.
    <View className="mb-3">
      {/* morphLabel: this label changes in place as the user logs — "Mark as
          watched" → "Log episode 4" → "Log rewatch" — which is exactly what
          MorphText is for. */}
      <Button
        disabled={!canLog}
        // `eye` once it's in your history, `eye-outline` before — the same
        // filled/outline pairing the watchlist CTA uses for its own settled
        // state, so "already done" reads identically on both buttons.
        icon={<Button.Icon name={isRewatch ? 'eye' : 'eye-outline'} />}
        label={buttonLabel}
        // The episode number arrives with Trakt's progress read — a spinner
        // says "resolving which episode", not "your tap did nothing".
        loading={seriesNextState.status === 'loading'}
        morphLabel
        onPress={() => {
          haptics.selection();
          logMedia.reset();
          setWatchedAt(null);
          setTags(DEFAULT_TAGS);
          setSelectedProviders(targets);
          setOpen(true);
        }}
      />
      {/* The finished-show state earns a line of its own: the button below
          reads "Log rewatch", and this is what makes that make sense. */}
      {seriesNext?.rewatch === true && result == null && (
        <Text className="text-muted font-sans text-sm mt-2 text-center">
          🎉 You’ve watched every aired episode.
        </Text>
      )}
      {/* The inline result blocks are gone (plan 0032 R9/U4): a clean report
          is a toast, and anything left to read renders inside the sheet, which
          stays open until the report settles. */}

      <LogConfirmSheet
        onClose={() => setOpen(false)}
        confirmLabel={confirmLabelFor(
          isSeries
            ? seriesAction
            : isAnimeSeries
              ? `Log episode ${nextEpisode}`
              : isRewatch
                ? 'Log rewatch'
                : 'Log watch',
          selectedProviders,
        )}
        description={
          isSeries
            ? seriesNext?.rewatch === true
              ? `You’ve watched every aired episode of “${item.title}” — this starts a rewatch at ${seriesLabel}.`
              : seriesNext?.title != null
                ? `“${item.title}” — ${seriesLabel}: ${seriesNext.title}`
                : `Log ${seriesLabel} of “${item.title}”.`
            : isAnimeSeries
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
          isSeries
            ? seriesAction
            : isAnimeSeries
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
