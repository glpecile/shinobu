import {
  Redirect,
  useLocalSearchParams,
  useRouter,
  type ErrorBoundaryProps,
} from 'expo-router';
import { Suspense } from 'react';
import { View } from 'react-native';

import { PersonNotFound, PersonSkeleton } from '@/features/person';
import { pickPersonMatch } from '@/lib/providers/tmdb/normalize';
import { routes } from '@/lib/routes';
import { useSuspenseTmdbStudioSearchQuery } from '@/state/queries/tmdb';

/**
 * Name → company-id resolution hop for studios whose origin provider has no
 * TMDB id (AniList's) — the studio twin of /person/lookup: suspend on the
 * company search, pick via `pickPersonMatch` (generic over names), then
 * replace this route with `/studio/[id]`.
 */
function LookupContent({ name, onGoBack }: { name: string; onGoBack: () => void }) {
  const { data } = useSuspenseTmdbStudioSearchQuery({ name });
  const match = pickPersonMatch(data, name);

  if (match == null) {
    return (
      <PersonNotFound detail={`No results for “${name}”.`} onGoBack={onGoBack} />
    );
  }
  return <Redirect href={routes.studio(match.tmdbId)} />;
}

export default function StudioLookupScreen() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  const router = useRouter();

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(routes.home);
    }
  }

  if (name == null || name === '') {
    return (
      <PersonNotFound detail="This studio page doesn't exist." onGoBack={goBack} />
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Suspense fallback={<PersonSkeleton />}>
        <LookupContent name={name} onGoBack={goBack} />
      </Suspense>
    </View>
  );
}

/** Route-level containment — a failed search shows the not-found view with
 * a retry instead of taking the whole app down via the root boundary. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const router = useRouter();
  return (
    <PersonNotFound
      detail="This studio couldn't be loaded."
      onGoBack={() =>
        router.canGoBack() ? router.back() : router.replace(routes.home)
      }
      onRetry={retry}
    />
  );
}
