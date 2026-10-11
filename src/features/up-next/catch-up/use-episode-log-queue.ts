import type { LogRequest } from '@/features/log-media/log-request';
import { simklEpisodeIsWatched } from '@/lib/providers/simkl/episode-state';
import { hasAired } from '@/lib/time/has-aired';
import { useAniListEntryStateQuery, useAniListEpisodesQuery } from '@/state/queries/anilist';
import { useAniListEpisodeWatchedQuery } from '@/state/queries/mapping';
import { useShowSeasonsQuery, useShowSeasonsSource } from '@/state/queries/show-seasons';
import { useSimklEpisodeStateQuery, useSimklLibraryEntryQuery } from '@/state/queries/simkl';
import { useTraktShowProgressQuery } from '@/state/queries/trakt';
import { useConnectedProviders } from '@/state/session';
import { airedAnimeEpisodes, catalogueCatchUpQueue, type CatchUpEpisode } from './queue';

/** A detail-page log uses the same catalogue and watched evidence as its season rows. */
export function useEpisodeLogQueue(request: LogRequest): CatchUpEpisode[] | null {
  const { item } = request;
  const first: CatchUpEpisode = request.episodes?.[0] ?? { number: request.entryEpisodes![0] };
  const canonical = first.season != null;
  const connected = useConnectedProviders();
  const source = useShowSeasonsSource(item);
  const seasons = useShowSeasonsQuery(canonical ? source : null);
  const anime = useAniListEpisodesQuery({
    mediaId: item.externalIds.anilist, enabled: !canonical,
  });
  const anilist = useAniListEntryStateQuery({
    mediaId: item.externalIds.anilist,
    enabled: !canonical && connected.includes('anilist'),
  });
  const canonicalAnilist = useAniListEpisodeWatchedQuery({
    item, enabled: canonical && connected.includes('anilist'),
  });
  const trakt = useTraktShowProgressQuery({
    traktId: canonical ? item.externalIds.trakt : undefined,
    enabled: canonical && connected.includes('trakt'),
  });
  const simkl = useSimklEpisodeStateQuery({
    item, enabled: canonical && connected.includes('simkl'),
  });
  const simklAnime = useSimklLibraryEntryQuery({
    item: !canonical ? item : null, enabled: connected.includes('simkl'),
  });

  if (seasons.isLoading || anime.isLoading || anilist.isLoading ||
    trakt.isLoading || simkl.isLoading || simklAnime.isLoading || canonicalAnilist.isLoading) return null;
  if (canonicalAnilist.isError) return [first];

  // A failed progress read cannot prove which later episodes are unwatched.
  if (canonical
    ? connected.includes('trakt') && item.externalIds.trakt != null
      ? trakt.isError
      : connected.includes('simkl') && simkl.isError
    : connected.includes('anilist') && item.externalIds.anilist != null
      ? anilist.isError
      : connected.includes('simkl') && simklAnime.isError) return [first];

  const candidates: CatchUpEpisode[] = [];
  if (canonical) {
    for (const season of seasons.data ?? []) {
      if (season.number === 0) continue;
      for (const episode of season.episodes) {
        const watched = connected.includes('trakt') && trakt.data != null
          ? trakt.data.watchedKeys.has(`${season.number}-${episode.number}`)
          : connected.includes('simkl') && simklEpisodeIsWatched(
              simkl.data, season.number, episode.number, episode.firstAired,
            );
        if (hasAired(episode.firstAired) && !watched &&
          !canonicalAnilist.data.has(`${season.number}-${episode.number}`)) {
          candidates.push({ season: season.number, number: episode.number, title: episode.title });
        }
      }
    }
  } else {
    const progress = connected.includes('anilist') && anilist.data != null
      ? anilist.data.entry?.progress ?? 0
      : connected.includes('simkl') && simklAnime.data != null
        ? simklAnime.data.item.currentProgress
        : item.currentProgress;
    const entry = connected.includes('simkl') ? simklAnime.data : null;
    const total = entry?.item.totalEpisodes;
    const airedCount = total != null && entry?.notAiredEpisodes != null
      ? total - entry.notAiredEpisodes : null;
    // Simkl-only anime has no AniList schedule. Its own aired count and watched
    // keys are the same evidence the Continue Watching chain already trusts.
    if (item.externalIds.anilist == null && airedCount != null) {
      for (let number = first.number + 1; number <= Math.min(airedCount, first.number + 200); number++) {
        if (number <= progress || entry?.watchedKeys.has(`1-${number}`)) continue;
        candidates.push({ number });
      }
    }
    for (const episode of airedAnimeEpisodes(item, anime.data?.episodes ?? [], airedCount)) {
      if (episode.number > progress && !entry?.watchedKeys.has(`1-${episode.number}`)) {
        candidates.push({ number: episode.number, title: episode.title });
      }
    }
  }
  return catalogueCatchUpQueue(first, candidates);
}
