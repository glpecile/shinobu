import { hasAired } from '@/lib/time/has-aired';
import type { NormalizedMediaItem, NormalizedSeason } from '@/types/media';
import type { LogRequest } from './log-request';

/** A whole-series log requires catalogue completion, never just an empty next pointer. */
export function letterboxdCompletionRequest(
  show: NormalizedMediaItem,
  film: NormalizedMediaItem | null | undefined,
  catalogue: NormalizedMediaItem | null | undefined,
  seasons: NormalizedSeason[] | undefined,
  watched: ReadonlySet<string>,
  confirmed: readonly { season?: number; number: number }[] = [],
): LogRequest | null {
  if (show.type !== 'TV' || show.externalIds.tmdb == null ||
    film?.externalIds.letterboxd == null || film.tmdbTvVariant !== show.externalIds.tmdb ||
    catalogue?.seriesEnded !== true || (catalogue.totalEpisodes ?? 0) <= 0) return null;
  const episodes = (seasons ?? []).filter((season) => season.number > 0)
    .flatMap((season) => season.episodes.map((episode) => ({ ...episode, season: season.number })));
  if (episodes.length < catalogue.totalEpisodes! || !episodes.every((episode) => hasAired(episode.firstAired))) return null;
  const complete = (keys: ReadonlySet<string>) => episodes.every((episode) => keys.has(`${episode.season}-${episode.number}`));
  // A rewatch's first episode must not create another whole-series diary entry.
  if (confirmed.length > 0 && complete(watched)) return null;
  const after = new Set(watched);
  for (const episode of confirmed) {
    if (episode.season != null) after.add(`${episode.season}-${episode.number}`);
  }
  if (!complete(after)) return null;
  return {
    item: film,
    title: 'Log on Letterboxd',
    description: `You’ve completed “${show.title}”. Letterboxd records the whole series as one entry; this won’t change your episode progress.`,
  };
}
