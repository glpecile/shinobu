import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Suspense } from 'react';

import { FloatingBackButton } from '@/components/floating-back-button';
import { FloatingShareButton } from '@/components/floating-share-button';
import { ScrolledTitle } from '@/components/scrolled-title';
import { PersonNotFound } from '@/features/person';
import { StudioSkeleton } from '@/features/studio/studio-skeleton';
import { StudioDetailsView } from '@/features/studio/studio-details-view';
import { pickPersonMatch } from '@/lib/providers/tmdb/normalize';
import { routes } from '@/lib/routes';
import { useSuspenseTmdbStudioQuery, useSuspenseTmdbStudioSearchQuery } from '@/state/queries/tmdb';

function ResolvedStudio({ tmdbId }: { tmdbId: number }) {
  const { data } = useSuspenseTmdbStudioQuery({ tmdbId });
  return <StudioDetailsView {...data} />;
}

function LookupContent({ name, onGoBack }: { name: string; onGoBack: () => void }) {
  const { data } = useSuspenseTmdbStudioSearchQuery({ name });
  const match = pickPersonMatch(data, name);

  if (match == null) {
    return <PersonNotFound detail={`No results for “${name}”.`} onGoBack={onGoBack} />;
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
    return <PersonNotFound detail="This studio page doesn’t exist." onGoBack={goBack} />;
  }

  return (
    <ScrolledTitle>
      <Suspense
        fallback={
          <>
            <StudioSkeleton />
            <FloatingShareButton href={routes.studioLookup(name)} />
          </>
        }
      >
        <LookupContent name={name} onGoBack={goBack} />
      </Suspense>
      <FloatingBackButton onPress={goBack} />
    </ScrolledTitle>
  );
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const router = useRouter();
  return (
    <PersonNotFound
      detail="This studio couldn’t be loaded."
      title="Couldn’t load"
      onGoBack={() => (router.canGoBack() ? router.back() : router.replace(routes.home))}
      onRetry={retry}
    />
  );
}
