import { View } from 'react-native';

import { Button } from '@/components/button';
import { useCatchUpControls, useQuickLogBusy } from '@/features/log-media/session/state';
import { Provider } from '@/lib/providers/types';
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
import { useFilmPlaysQuery } from '@/state/queries/use-diary-feed';
import { useWatchedInfo } from '@/state/queries/watched-info';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';
import { filmReleaseStatus, hasStartedAiring, unreleasedFilmLabel } from './release-gate';
import { LogBookButton } from './log-book-button';
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
 * Pass `onOpenRequest` when rendered inside a sheet to swap inline: a second
 * native bottom sheet cannot co-present over an open one.
 */
export function LogMediaButton(props: { item: NormalizedMediaItem; onOpenRequest?: (request: LogRequest) => void }) {
  return props.item.type === 'BOOK' ? <LogBookButton {...props} /> : <LogWatchButton {...props} />;
}

function LogWatchButton({ item, onOpenRequest }: { item: NormalizedMediaItem; onOpenRequest?: (request: LogRequest) => void }) {
  const connected = useConnectedProviders();
  const { openLog } = useCatchUpControls();
  const busy = useQuickLogBusy(item.id);
  const watchedInfo = useWatchedInfo(item);
  const filmPlays = useFilmPlaysQuery(item);
  const anilistEntry = useAniListEntryStateQuery({
    type: item.type,
    mediaId: item.externalIds.anilist,
    enabled: connected.includes(Provider.AniList),
  });
  const anilistEpisodes = useAniListEpisodesQuery({
    mediaId: item.externalIds.anilist,
    enabled: item.type === 'ANIME' && item.externalIds.anilist != null,
  });
  const seriesNextState = useSeriesNextEpisode(item);
  const isAnimeSeries = item.type === 'ANIME' && item.isFilm !== true;
  const isManga = item.type === 'MANGA';
  // Only an item that names its own Simkl entry: a TMDB id is shared by every
  // season of an anime, so matching on it would read a sibling's progress.
  const simklAnimeEntry = useSimklLibraryEntryQuery({
    item: isAnimeSeries && item.externalIds.simkl != null ? item : null,
    enabled: connected.includes(Provider.Simkl),
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
  if (
    (!isFilmLike && !isAnimeSeries && !isSeries && !isManga) ||
    (targets.length === 0 && manualTargets.length === 0) ||
    (isSeries && seriesNextState.status === 'unavailable')
  ) {
    return null;
  }

  const seriesLabel = seriesNext == null ? '' : seriesEpisodeLabel(seriesNext);
  const seriesAction =
    seriesNext == null
      ? 'Log next episode'
      : seriesNext.rewatch
        ? 'Rewatch'
        : `Log ${seriesLabel}`;
  const seriesUnaired = seriesNext?.unaired === true;

  const anilistStatus = anilistEntry.data?.entry?.status;
  const anilistProgress = anilistEntry.data?.entry?.progress;
  const isRewatch =
    watchedInfo != null ||
    (filmPlays.data?.length ?? 0) > 0 ||
    anilistStatus === 'COMPLETED' ||
    anilistStatus === 'REPEATING';

  const total = anilistEntry.data?.total ?? item.totalEpisodes;
  const currentProgress =
    anilistProgress ?? simklAnimeEntry.data?.item.currentProgress ?? item.currentProgress;
  const entryRepeat =
    (isAnimeSeries || isManga) && total != null && total > 0 && currentProgress >= total;
  const nextEpisode = entryRepeat ? 1 : currentProgress + 1;
  const chapterRange =
    isManga && !entryRepeat && (total == null || total > nextEpisode)
      ? { from: nextEpisode, ...(total != null ? { total } : {}) }
      : null;

  const episodeData = anilistEpisodes.data?.episodes.find(
    (e) => e.number === nextEpisode,
  );
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

  const releaseStatus = isFilmLike ? filmReleaseStatus(item) : 'released';
  const released = releaseStatus === 'released';
  const seriesEpisodeAired =
    !isSeries || (seriesNext?.aired === true && upcoming == null);
  const mangaProgressKnown = !isManga || anilistEntry.data !== undefined;
  const canLog = nextEpisodeAired && released && seriesEpisodeAired && mangaProgressKnown;

  const action = isSeries
    ? seriesAction
    : isAnimeSeries
      ? entryRepeat
        ? 'Rewatch'
        : `Log episode ${nextEpisode}`
      : isManga
        ? entryRepeat
          ? 'Reread'
          : `Log chapter ${nextEpisode}`
        : isRewatch
          ? 'Rewatch'
          : 'Mark as watched';

  const blocked = isSeries
    ? upcoming != null
      ? unairedEpisodeLabel(seriesEpisodeLabel(upcoming), upcoming.firstAired)
      : seriesUnaired
        ? 'Hasn’t aired yet'
        : seriesNext != null && !seriesNext.rewatch && !seriesNext.aired
          ? unairedEpisodeLabel(seriesLabel, seriesNext.firstAired)
          : null
    : isAnimeSeries
      ? nextEpisodeAired
        ? null
        : unairedEpisodeLabel(`Episode ${nextEpisode}`, episodeData?.firstAired)
      : isManga
        ? !mangaProgressKnown && anilistEntry.isError ? 'Couldn’t load your progress' : null
        : releaseStatus === 'unknown'
          ? 'No release date yet'
          : releaseStatus === 'unreleased'
            ? unreleasedFilmLabel(item.releaseDate)
            : null;

  const description =
    isSeries && seriesNext?.rewatch === true
      ? `You’ve watched every aired episode of “${item.title}” — this starts a rewatch at ${seriesLabel}.`
      : isSeries && seriesNext?.title != null
        ? `“${item.title}” — ${seriesLabel}: ${seriesNext.title}`
        : entryRepeat
          ? isManga
            ? `You’ve read every chapter of “${item.title}” — this starts a reread at chapter 1.`
            : `You’ve watched every episode of “${item.title}” — this starts a rewatch at episode 1.`
          : isFilmLike && isRewatch
          ? `“${item.title}” is already in your history — this logs another watch.`
          : `“${item.title}”`;

  return (
    <View className="mb-3">
      <Button
        variant="log"
        disabled={!canLog}
        icon={<Button.Icon name={isRewatch ? 'eye' : 'eye-outline'} />}
        label={blocked ?? action}
        loading={
          seriesNextState.status === 'loading' ||
          (upcomingNeeded && seasons.isLoading) ||
          simklAnimeEntry.isLoading ||
          (isManga && anilistEntry.isFetching) || busy
        }
        morphLabel
        onPress={() => {
          const request: LogRequest = {
            item, title: action, description,
            ...(isAnimeSeries || isManga ? { entryEpisodes: [nextEpisode] } : {}),
            ...(chapterRange != null ? { chapterRange } : {}),
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
    </View>
  );
}
