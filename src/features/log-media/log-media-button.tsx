import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { useCatchUpControls, useQuickLogBusy } from '@/features/up-next/catch-up/state';
import { hasAired } from '@/lib/time/has-aired';
import {
  useAniListEntryStateQuery,
  useAniListEpisodesQuery,
} from '@/state/queries/anilist';
import {
  useShowSeasonsQuery,
  useShowSeasonsSource,
} from '@/state/queries/show-seasons';
import { useSimklLibraryEntryQuery } from '@/state/queries/simkl';
import { useWatchedInfo } from '@/state/queries/watched-info';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';
import { filmReleaseStatus, hasStartedAiring, unreleasedFilmLabel } from './release-gate';
import type { LogRequest } from './log-request';
import { useLogTargetsSplit } from './use-log-targets';
import {
  firstUnairedEpisode,
  seriesEpisodeLabel,
  simklAnimeEpisodeAired,
  unairedEpisodeLabel,
} from './series-next-episode';
import { useSeriesNextEpisode } from './use-series-next-episode';

/**
 * Resolves the next log and its release gate, then opens the app-level logging
 * session. Films confirm once; series share the Continue Watching catch-up
 * chain. When no next episode can be named, the season picker takes over.
 *
 * `onOpenRequest` intercepts the built request before it opens the app-level
 * session, so a host that is already a sheet (the card-actions sheet) can
 * render the log form in place of its own rows instead: a second native
 * sheet can't co-present over the first — it settles closed and its `onSettle`
 * immediately closes the session again, so the tap reads as dead — while web
 * Modals stack.
 */
export function LogMediaButton({ item, onOpenRequest }: { item: NormalizedMediaItem; onOpenRequest?: (request: LogRequest) => void }) {
  const connected = useConnectedProviders();
  const { openLog } = useCatchUpControls();
  const busy = useQuickLogBusy(item.id);
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
  const isAnimeSeries = item.type === 'ANIME' && item.isFilm !== true;
  // Only an item that names its own Simkl entry: a TMDB id is shared by every
  // season of an anime, so matching on it would read a sibling's progress.
  const simklAnimeEntry = useSimklLibraryEntryQuery({
    item: isAnimeSeries && item.externalIds.simkl != null ? item : null,
    enabled: connected.includes('simkl'),
  });
  const { writable: targets, manual: manualTargets } = useLogTargetsSplit(item);

  const isFilmLike =
    item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
  const isSeries = item.type === 'TV';
  const seriesNext =
    seriesNextState.status === 'ready' ? seriesNextState.episode : null;
  // The season layout is the only thing that tells "caught up, more coming"
  // from "finished" (docs/solutions/trackers-cant-tell-caught-up-from-finished.md),
  // so it is read only in the two states whose copy depends on it.
  const seasonsSource = useShowSeasonsSource(item);
  const upcomingNeeded =
    isSeries && (seriesNext?.rewatch === true || seriesNext?.unaired === true);
  const seasons = useShowSeasonsQuery(upcomingNeeded ? seasonsSource : null);
  const upcoming = upcomingNeeded ? firstUnairedEpisode(seasons.data) : null;
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

  const seriesLabel = seriesNext == null ? '' : seriesEpisodeLabel(seriesNext);
  // The one action the series button performs, reused by the confirm sheet's
  // title and confirm label so all three read identically. A finished show
  // says "rewatch" rather than naming S1E1 as if it were up next — the same
  // word the movie path uses for the same situation.
  const seriesAction =
    seriesNext == null
      ? 'Log next episode'
      : seriesNext.rewatch
        ? 'Rewatch'
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

  // Anime series log the next unwatched episode. Prefer the provider's live
  // entry over the item's own progress, which is a snapshot of wherever the
  // tap came from: 0 on a trending card or a cold-resolved Simkl page.
  const total = item.totalEpisodes;
  const currentProgress =
    anilistProgress ?? simklAnimeEntry.data?.item.currentProgress ?? item.currentProgress;
  // A finished entry wraps to episode 1 and says so, like the series path.
  const animeRewatch =
    isAnimeSeries && total != null && total > 0 && currentProgress >= total;
  const nextEpisode = animeRewatch ? 1 : currentProgress + 1;

  // Never offer to log an episode that hasn't aired yet (todos/006).
  // Only evaluate aired status once the episodes query has successfully loaded.
  // While loading/pending/error, treat as not aired (disable button).
  // Once loaded:
  // - Episode not in schedule → not aired (new anime, episode not yet scheduled)
  // - Episode in schedule but no air date → aired if the show has started
  // - Episode in schedule with air date → use hasAired
  const episodeData = anilistEpisodes.data?.episodes.find(
    (e) => e.number === nextEpisode,
  );
  // Without an AniList id that schedule never loads, so the Simkl entry is
  // the evidence instead, and failing that the show's own release.
  const nextEpisodeAired =
    !isAnimeSeries ||
    (item.externalIds.anilist == null
      ? simklAnimeEntry.data != null
        ? simklAnimeEpisodeAired(
            nextEpisode,
            { currentProgress, totalEpisodes: total },
            simklAnimeEntry.data,
          )
        : hasStartedAiring(item, [])
      : anilistEpisodes.status === 'success' &&
        anilistEpisodes.data != null &&
        (episodeData == null
          ? false
          : episodeData.firstAired == null
            ? hasStartedAiring(item, anilistEpisodes.data.episodes)
            : hasAired(episodeData.firstAired)));

  // The movie counterpart of that gate: a film that isn't out yet can't be
  // watched, so it can't be logged — and unlike the episode rule above, an
  // *unknown* release date blocks too (see `filmReleaseStatus`).
  const releaseStatus = isFilmLike ? filmReleaseStatus(item) : 'released';
  const released = releaseStatus === 'released';
  // Same gate on the TV side, from Trakt's air date rather than AniList's.
  // The rewatch wrap to S1E1 reads as "aired"; `upcoming` is the episode this
  // user is actually waiting on.
  const seriesEpisodeAired =
    !isSeries || (seriesNext?.aired === true && upcoming == null);
  const canLog = nextEpisodeAired && released && seriesEpisodeAired;

  // The one string this whole flow speaks: the CTA's label, the confirm
  // sheet's title, and its confirm button. These were three ternary chains
  // that had already drifted — the movie CTA read "Mark as watched" and
  // opened a sheet titled "Log watch" over a button saying the same.
  const action = isSeries
    ? seriesAction
    : isAnimeSeries
      ? animeRewatch
        ? 'Rewatch'
        : `Log episode ${nextEpisode}`
      : isRewatch
        ? 'Rewatch'
        : 'Mark as watched';

  // Why the action can't run yet, when it can't — the only thing that ever
  // replaces it on the CTA (the sheet can't open in these states at all).
  const blocked = isSeries
    ? upcoming != null
      ? unairedEpisodeLabel(seriesEpisodeLabel(upcoming), upcoming.firstAired)
      : seriesUnaired
        ? // No layout named a date either, so naming an episode would imply a
          // schedule the show doesn't have.
          'Hasn’t aired yet'
        : seriesNext != null && !seriesNext.rewatch && !seriesNext.aired
          ? unairedEpisodeLabel(seriesLabel, seriesNext.firstAired)
          : null
    : isAnimeSeries
      ? nextEpisodeAired
        ? null
        : unairedEpisodeLabel(`Episode ${nextEpisode}`, episodeData?.firstAired)
      : releaseStatus === 'unknown'
        ? 'No release date yet'
        : releaseStatus === 'unreleased'
          ? unreleasedFilmLabel(item.releaseDate)
          : null;

  // The subject, never the verb a second time: the title above already says
  // what this does, so the line under it says what it does it *to* — the
  // shape the catch-up sheet already uses.
  const description =
    isSeries && seriesNext?.rewatch === true
      ? `You’ve watched every aired episode of “${item.title}” — this starts a rewatch at ${seriesLabel}.`
      : isSeries && seriesNext?.title != null
        ? `“${item.title}” — ${seriesLabel}: ${seriesNext.title}`
        : animeRewatch
          ? `You’ve watched every episode of “${item.title}” — this starts a rewatch at episode 1.`
          : isFilmLike && isRewatch
          ? `“${item.title}” is already in your history — this logs another watch.`
          : `“${item.title}”`;

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
        label={blocked ?? action}
        // The episode number arrives with Trakt's progress read — a spinner
        // says "resolving which episode", not "your tap did nothing".
        loading={
          seriesNextState.status === 'loading' ||
          (upcomingNeeded && seasons.isLoading) ||
          simklAnimeEntry.isLoading || busy
        }
        morphLabel
        onPress={() => {
          const request: LogRequest = {
            item, title: action, description,
            ...(isAnimeSeries ? { entryEpisodes: [nextEpisode] } : {}),
            ...(isSeries && seriesNext != null
              ? { episodes: [{ season: seriesNext.season, number: seriesNext.number }] }
              : {}),
          };
          if (onOpenRequest != null) {
            onOpenRequest(request);
            return;
          }
          openLog(request);
        }}
      />
      {/* The finished-show state earns a line of its own: the button below
          reads "Log rewatch", and this is what makes that make sense. */}
      {canLog &&
        ((seriesNext?.rewatch === true && upcoming == null) || animeRewatch) &&
        !busy && (
          <Text className="text-muted font-sans text-sm mt-2 text-center">
            🎉 You’ve watched every aired episode.
          </Text>
        )}
    </View>
  );
}
