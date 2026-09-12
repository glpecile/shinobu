import {
  useLocalSearchParams,
  useRouter,
  type ErrorBoundaryProps,
} from 'expo-router';
import { Suspense } from 'react';
import { ScrollView, View } from 'react-native';

import { FloatingBackButton } from '@/components/floating-back-button';
import { PersonNotFound, PersonSkeleton } from '@/features/person';
import { StudioDetailsView } from '@/features/studio/studio-details-view';
import { pickPersonMatch } from '@/lib/providers/tmdb/normalize';
import { routes } from '@/lib/routes';
import {
  useSuspenseTmdbStudioQuery,
  useSuspenseTmdbStudioSearchQuery,
} from '@/state/queries/tmdb';

function ResolvedStudio({ tmdbId }: { tmdbId: number }) {
  const { data } = useSuspenseTmdbStudioQuery({ tmdbId });
  return <StudioDetailsView {...data} />;
}

/**
 * Name → company-id resolution for studios whose origin provider has no TMDB
 * id (AniList's) — the studio twin of /person/lookup, picking via
 * `pickPersonMatch` (generic over names).
 *
 * Renders the page here rather than redirecting to `/studio/[id]`, for the
 * reason spelled out in `person/lookup.tsx`: the replace was a second screen
 * transition that faded the stack through black and restarted the skeleton.
 */
function LookupContent({ name, onGoBack }: { name: string; onGoBack: () => void }) {
  const { data } = useSuspenseTmdbStudioSearchQuery({ name });
  const match = pickPersonMatch(data, name);

  if (match == null) {
    return (
      <PersonNotFound detail={`No results for “${name}”.`} onGoBack={onGoBack} />
    );
  }
  return <ResolvedStudio tmdbId={match.tmdbId} />;
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
      <ScrollView className="flex-1">
        <Suspense fallback={<PersonSkeleton />}>
          <LookupContent name={name} onGoBack={goBack} />
        </Suspense>
      </ScrollView>
      <FloatingBackButton onPress={goBack} />
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
