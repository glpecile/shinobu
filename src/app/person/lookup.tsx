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
import { useSuspenseTmdbPersonSearchQuery } from '@/state/queries/tmdb';

/**
 * Name → person-id resolution hop for credits whose origin provider carries
 * no TMDB person id (AniList voice actors/staff — there is no id bridge for
 * people). Suspends on a TMDB person search, picks the best candidate via
 * `pickPersonMatch` (never blindly the top hit), and replaces itself with
 * `/person/[id]` so back-navigation skips this route entirely.
 */
function LookupContent({ name, onGoBack }: { name: string; onGoBack: () => void }) {
  const { data } = useSuspenseTmdbPersonSearchQuery({ name });
  const match = pickPersonMatch(data, name);

  if (match == null) {
    return (
      <PersonNotFound
        detail={`No results for “${name}”.`}
        onGoBack={onGoBack}
      />
    );
  }
  return <Redirect href={routes.person(match.tmdbId)} />;
}

export default function PersonLookupScreen() {
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
      <PersonNotFound detail="This person page doesn't exist." onGoBack={goBack} />
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
      detail="This person couldn't be loaded."
      onGoBack={() =>
        router.canGoBack() ? router.back() : router.replace(routes.home)
      }
      onRetry={retry}
    />
  );
}
