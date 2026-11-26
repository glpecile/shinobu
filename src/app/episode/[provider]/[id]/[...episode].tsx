import { Redirect, useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';

import { EpisodeScreen, EpisodeScreenSkeleton } from '@/features/episode-details';
import { PersonNotFound } from '@/features/person';
import { placeInLayout } from '@/lib/providers/mapping/season-layout';
import { applyPrimaryMetadata } from '@/lib/providers/merge-metadata';
import { Provider } from '@/lib/providers/types';
import { mediaItemId, routes } from '@/lib/routes';
import { useAniZipEpisodeMapQuery, useSeasonLayoutQuery } from '@/state/queries/mapping';
import { useMediaDetailsQuery } from '@/state/queries/media-details';
import { useResolvedMediaItem } from '@/state/queries/resolve-item';

export default function EpisodeRoute() {
  const {
    provider,
    id: resourceId,
    episode,
  } = useLocalSearchParams<{
    provider: string;
    id: string;
    episode: string[];
  }>();
  const id = mediaItemId(provider, resourceId);
  const parts = Array.isArray(episode) ? episode : [];
  const [season, number] = parts.length === 1 ? [undefined, parts[0]] : parts;
  const detailsHref = id == null ? routes.home : routes.details(id, 'TV');
  const router = useRouter();
  const { item: resolved, isLoading } = useResolvedMediaItem(
    id ?? '',
    provider === Provider.Trakt ? 'TV' : undefined,
  );
  const mediaDetails = useMediaDetailsQuery(resolved);
  const item =
    resolved == null ? undefined : applyPrimaryMetadata(resolved, mediaDetails.data?.catalogue);
  const episodeNumber = Number(number);
  const placing = season == null && item?.type === 'ANIME';
  const anilistId = placing ? (item?.externalIds.anilist ?? undefined) : undefined;
  const tmdbId = placing ? (item?.externalIds.tmdb ?? undefined) : undefined;
  const episodeMap = useAniZipEpisodeMapQuery(anilistId);
  const layout = useSeasonLayoutQuery({ tmdb: tmdbId });
  const row = episodeMap.data?.get(episodeNumber);
  const pointer = placing
    ? row == null
      ? null
      : placeInLayout(layout.data, row)
    : { season: Number(season), number: episodeNumber };
  const placingPending =
    placing &&
    (mediaDetails.isPending ||
      (anilistId != null && episodeMap.isPending) ||
      (tmdbId != null && layout.isPending));
  const pointerValid =
    parts.length > 0 &&
    parts.length <= 2 &&
    pointer != null &&
    Number.isInteger(pointer.season) &&
    pointer.season >= 0 &&
    Number.isInteger(pointer.number) &&
    pointer.number > 0;

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(detailsHref);
    }
  }

  if ((isLoading && item == null) || placingPending) {
    return <EpisodeScreenSkeleton onBack={goBack} />;
  }

  if (item == null || !pointerValid) {
    return <Redirect href={detailsHref} />;
  }

  return (
    <EpisodeScreen item={item} number={pointer.number} onBack={goBack} season={pointer.season} />
  );
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const router = useRouter();
  return (
    <PersonNotFound
      detail="This episode couldn’t be loaded."
      title="Couldn’t load"
      onGoBack={() => (router.canGoBack() ? router.back() : router.replace(routes.home))}
      onRetry={retry}
    />
  );
}
