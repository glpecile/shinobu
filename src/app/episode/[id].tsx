import {
  useLocalSearchParams,
  useRouter,
  type ErrorBoundaryProps,
} from 'expo-router';
import { View } from 'react-native';

import { EpisodeScreen } from '@/features/episode-details';
import { PersonNotFound } from '@/features/person';
import { placeInLayout } from '@/lib/providers/mapping/season-layout';
import { applyPrimaryMetadata } from '@/lib/providers/merge-metadata';
import { routes } from '@/lib/routes';
import { useAniZipEpisodeMapQuery, useSeasonLayoutQuery } from '@/state/queries/mapping';
import { useMediaDetailsQuery } from '@/state/queries/media-details';
import { useResolvedMediaItem } from '@/state/queries/resolve-item';

/**
 * `/episode/[id]?season=&number=` — one episode of the show `id`, which
 * resolves exactly like `/details/[id]` (cache-only, every surface a card can
 * be tapped on). Without `season` (`routes.animeEpisode`) `number` is an anime
 * entry's own numbering and this route places it on the trackers' layout the
 * way the seasons accordion does — the ani.zip read belongs to a details
 * screen, not to every diary row (plan 0027 R7). The screen itself is platform-split
 * (`features/episode-details/screen`): iOS presents it as a form sheet,
 * Android and web as full pages with their own layouts.
 */
export default function EpisodeRoute() {
  const { id, season, number } = useLocalSearchParams<{
    id: string;
    season?: string;
    number?: string;
  }>();
  const router = useRouter();
  const { item: resolved, isLoading } = useResolvedMediaItem(id);
  // The same TMDB-over-provider merge the details screen applies: an anime
  // item has no TMDB id of its own, the catalogue read discovers it, and the
  // episode surfaces are TMDB-keyed. Cached from the details screen that
  // linked here, so this costs no request.
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
    pointer != null &&
    Number.isInteger(pointer.season) &&
    pointer.season >= 0 &&
    Number.isInteger(pointer.number) &&
    pointer.number > 0;

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(routes.details(id));
    }
  }

  if ((isLoading && item == null) || placingPending) {
    return <View className="flex-1 bg-background" />;
  }

  if (item == null || !pointerValid) {
    return (
      <PersonNotFound
        detail={
          placing
            ? "This episode isn’t mapped to TMDB’s numbering yet."
            : 'This episode isn’t in your current feed.'
        }
        onGoBack={goBack}
      />
    );
  }

  return (
    <EpisodeScreen
      item={item}
      number={pointer.number}
      onBack={goBack}
      season={pointer.season}
    />
  );
}

/**
 * Route-level containment (plan 0013 §5): a failed seasons/TMDB read lands on
 * this screen's not-found view with a retry, not the root boundary.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const router = useRouter();
  return (
    <PersonNotFound
      detail="This episode couldn’t be loaded."
      onGoBack={() =>
        router.canGoBack() ? router.back() : router.replace(routes.home)
      }
      onRetry={retry}
    />
  );
}
