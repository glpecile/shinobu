import {
  useLocalSearchParams,
  useRouter,
  type ErrorBoundaryProps,
} from 'expo-router';
import { Suspense } from 'react';

import { FloatingBackButton } from '@/components/floating-back-button';
import { FloatingShareButton } from '@/components/floating-share-button';
import { ScrolledTitle } from '@/components/scrolled-title';
import { PersonNotFound } from '@/features/person';
import { StudioSkeleton } from '@/features/studio/studio-skeleton';
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

  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    return (
      <PersonNotFound detail="This studio page doesn't exist." onGoBack={goBack} />
    );
  }

  return (
    <ScrolledTitle>
      <Suspense fallback={<><StudioSkeleton /><FloatingShareButton href={routes.studio(tmdbId)} /></>}>
        <StudioContent tmdbId={tmdbId} />
      </Suspense>
      <FloatingBackButton onPress={goBack} />
    </ScrolledTitle>
  );
}

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
