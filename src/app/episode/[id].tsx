import {
  useLocalSearchParams,
  useRouter,
  type ErrorBoundaryProps,
} from 'expo-router';
import { View } from 'react-native';

import { EpisodeScreen } from '@/features/episode-details';
import { PersonNotFound } from '@/features/person';
import { applyPrimaryMetadata } from '@/lib/providers/merge-metadata';
import { routes } from '@/lib/routes';
import { useMediaDetailsQuery } from '@/state/queries/media-details';
import { useResolvedMediaItem } from '@/state/queries/resolve-item';

/**
 * `/episode/[id]?season=&number=` — one episode of the show `id`, which
 * resolves exactly like `/details/[id]` (cache-only, every surface a card can
 * be tapped on). The screen itself is platform-split
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
  const seasonNumber = Number(season);
  const episodeNumber = Number(number);
  const pointerValid =
    Number.isInteger(seasonNumber) &&
    seasonNumber >= 0 &&
    Number.isInteger(episodeNumber) &&
    episodeNumber > 0;

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(routes.details(id));
    }
  }

  if (isLoading && item == null) {
    return <View className="flex-1 bg-background" />;
  }

  if (item == null || !pointerValid) {
    return (
      <PersonNotFound
        detail="This episode isn’t in your current feed."
        onGoBack={goBack}
      />
    );
  }

  return (
    <EpisodeScreen
      item={item}
      number={episodeNumber}
      onBack={goBack}
      season={seasonNumber}
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
