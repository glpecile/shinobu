import {
  useLocalSearchParams,
  useRouter,
  type ErrorBoundaryProps,
} from 'expo-router';
import { Suspense } from 'react';
import { ScrollView, View } from 'react-native';

import { FloatingBackButton } from '@/components/floating-back-button';
// Layout-generic despite the name — the studio page shares the person
// page's header-plus-rows shape, so its skeleton and miss state fit as-is.
import { PersonNotFound, PersonSkeleton } from '@/features/person';
import { StudioDetailsView } from '@/features/studio/studio-details-view';
import { routes } from '@/lib/routes';
import { useSuspenseTmdbStudioQuery } from '@/state/queries/tmdb';

function StudioContent({ tmdbId }: { tmdbId: number }) {
  const { data } = useSuspenseTmdbStudioQuery({ tmdbId });
  return <StudioDetailsView {...data} />;
}

export default function StudioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tmdbId = Number(id);

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(routes.home);
    }
  }

  if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
    return (
      <PersonNotFound detail="This studio page doesn't exist." onGoBack={goBack} />
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1">
        <Suspense fallback={<PersonSkeleton />}>
          <StudioContent tmdbId={tmdbId} />
        </Suspense>
      </ScrollView>
      <FloatingBackButton onPress={goBack} />
    </View>
  );
}

/**
 * Route-level containment: a failed TMDB fetch (no token, 404, rate limit)
 * surfaces as this screen's not-found view with a retry — not the root
 * boundary unmounting the whole app.
 */
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
