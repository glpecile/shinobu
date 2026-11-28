import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Suspense } from 'react';

import { FloatingBackButton } from '@/components/floating-back-button';
import { FloatingShareButton } from '@/components/floating-share-button';
import { ScrolledTitle } from '@/components/scrolled-title';
import { PersonDetailsView, PersonNotFound, PersonSkeleton } from '@/features/person';
import { routes } from '@/lib/routes';
import { useSuspensePersonByNameQuery } from '@/state/queries/person-details';

function LookupContent({ name, onGoBack }: { name: string; onGoBack: () => void }) {
  const { data } = useSuspensePersonByNameQuery({ name });

  if (data == null) {
    return <PersonNotFound detail={`No results for “${name}”.`} onGoBack={onGoBack} />;
  }
  return <PersonDetailsView {...data} />;
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
    return <PersonNotFound onGoBack={goBack} title="Person not found" />;
  }

  return (
    <ScrolledTitle>
      <Suspense
        fallback={
          <>
            <PersonSkeleton />
            <FloatingShareButton href={routes.personLookup(name)} />
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
      title="Couldn’t load this person"
      onGoBack={() => (router.canGoBack() ? router.back() : router.replace(routes.home))}
      onRetry={retry}
    />
  );
}
