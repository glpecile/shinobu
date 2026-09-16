import {
  useLocalSearchParams,
  useRouter,
  type ErrorBoundaryProps,
} from 'expo-router';
import { Suspense } from 'react';
import { View } from 'react-native';

import { FloatingBackButton } from '@/components/floating-back-button';
import {
  PersonDetailsView,
  PersonNotFound,
  PersonSkeleton,
} from '@/features/person';
import { routes } from '@/lib/routes';
import { useSuspenseAniListCharacterQuery } from '@/state/queries/anilist';

function CharacterContent({ id }: { id: number }) {
  const { data } = useSuspenseAniListCharacterQuery({ id });
  return <PersonDetailsView {...data} showLinks={false} />;
}

export default function CharacterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const anilistId = Number(id);

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(routes.home);
    }
  }

  if (!Number.isFinite(anilistId) || anilistId <= 0) {
    return (
      <PersonNotFound detail="This character page doesn't exist." onGoBack={goBack} />
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Suspense fallback={<PersonSkeleton />}>
        <CharacterContent id={anilistId} />
      </Suspense>
      <FloatingBackButton onPress={goBack} />
    </View>
  );
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const router = useRouter();
  return (
    <PersonNotFound
      detail="This character couldn't be loaded."
      onGoBack={() =>
        router.canGoBack() ? router.back() : router.replace(routes.home)
      }
      onRetry={retry}
    />
  );
}
