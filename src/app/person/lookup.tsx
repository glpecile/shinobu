import {
  useLocalSearchParams,
  useRouter,
  type ErrorBoundaryProps,
} from 'expo-router';
import { Suspense } from 'react';
import { ScrollView, View } from 'react-native';

import { FloatingBackButton } from '@/components/floating-back-button';
import {
  PersonDetailsView,
  PersonNotFound,
  PersonSkeleton,
} from '@/features/person';
import { routes } from '@/lib/routes';
import { useSuspensePersonByNameQuery } from '@/state/queries/person-details';

/**
 * Name → person page for credits whose origin provider carries no TMDB person
 * id (AniList voice actors and staff — there is no id bridge for people).
 *
 * It **renders the page here** rather than redirecting to `/person/[id]`: an
 * AniList-resolved person has no TMDB id to redirect to, and the redirect was
 * a second screen transition on top of the first — the push faded in this
 * route's skeleton, then the replace faded the stack through black and started
 * a *second* skeleton before the page landed.
 */
function LookupContent({ name, onGoBack }: { name: string; onGoBack: () => void }) {
  const { data } = useSuspensePersonByNameQuery({ name });

  if (data == null) {
    return (
      <PersonNotFound detail={`No results for “${name}”.`} onGoBack={onGoBack} />
    );
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
    return (
      <PersonNotFound detail="This person page doesn't exist." onGoBack={goBack} />
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
      detail="This person couldn't be loaded."
      onGoBack={() =>
        router.canGoBack() ? router.back() : router.replace(routes.home)
      }
      onRetry={retry}
    />
  );
}
