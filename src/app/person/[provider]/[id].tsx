import {
  useLocalSearchParams,
  useRouter,
  type ErrorBoundaryProps,
} from 'expo-router';
import { Suspense } from 'react';

import { FloatingBackButton } from '@/components/floating-back-button';
import { FloatingShareButton } from '@/components/floating-share-button';
import { ScrolledTitle } from '@/components/scrolled-title';
import {
  PersonDetailsView,
  PersonNotFound,
  PersonSkeleton,
} from '@/features/person';
import { Provider } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import { useSuspenseHardcoverAuthorQuery } from '@/state/queries/hardcover';
import { useSuspenseAniListStaffQuery } from '@/state/queries/person-details';
import { useSuspenseTmdbPersonQuery } from '@/state/queries/tmdb';
import { SERVER_CONNECTED_PROVIDERS, useConnectedProviders } from '@/state/session';

function PersonContent({ tmdbId }: { tmdbId: number }) {
  const { data } = useSuspenseTmdbPersonQuery({ tmdbId });
  return <PersonDetailsView {...data} />;
}

function AniListPersonContent({ anilistId }: { anilistId: number }) {
  const { data } = useSuspenseAniListStaffQuery({ id: anilistId });
  return <PersonDetailsView {...data} />;
}

function HardcoverAuthorDetails({ authorId }: { authorId: number }) {
  const { data } = useSuspenseHardcoverAuthorQuery(authorId);
  return <PersonDetailsView {...data} />;
}

/** Every Hardcover read needs the member's session, which the web prerender doesn't have. */
function HardcoverAuthorContent({ authorId, onGoBack }: { authorId: number; onGoBack: () => void }) {
  const connected = useConnectedProviders();
  if (connected === SERVER_CONNECTED_PROVIDERS) return <PersonSkeleton />;
  if (!connected.includes(Provider.Hardcover)) {
    return (
      <PersonNotFound
        detail="Author pages open once Hardcover is connected in Settings."
        onGoBack={onGoBack}
      />
    );
  }
  return <HardcoverAuthorDetails authorId={authorId} />;
}

function ProviderPersonContent({ provider, personId, onGoBack }: { provider: string; personId: number; onGoBack: () => void }) {
  switch (provider) {
    case Provider.AniList:
      return <AniListPersonContent anilistId={personId} />;
    case Provider.Hardcover:
      return <HardcoverAuthorContent authorId={personId} onGoBack={onGoBack} />;
    default:
      return <PersonContent tmdbId={personId} />;
  }
}

function personRoute(provider: string, personId: number) {
  switch (provider) {
    case Provider.AniList:
      return routes.anilistPerson(personId);
    case Provider.Hardcover:
      return routes.hardcoverAuthor(personId);
    default:
      return routes.person(personId);
  }
}

export default function PersonScreen() {
  const { provider, id } = useLocalSearchParams<{ provider: string; id: string }>();
  const router = useRouter();
  const personId = Number(id);

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(routes.home);
    }
  }

  if (
    (provider !== 'tmdb' && provider !== Provider.AniList && provider !== Provider.Hardcover) ||
    !Number.isSafeInteger(personId) ||
    personId <= 0
  ) {
    return (
      <PersonNotFound detail="This person page doesn't exist." onGoBack={goBack} />
    );
  }

  return (
    <ScrolledTitle>
      <Suspense fallback={<><PersonSkeleton /><FloatingShareButton href={personRoute(provider, personId)} /></>}>
        <ProviderPersonContent onGoBack={goBack} personId={personId} provider={provider} />
      </Suspense>
      <FloatingBackButton onPress={goBack} />
    </ScrolledTitle>
  );
}

/**
 * Route-level containment: a failed TMDB fetch (no token, 404, rate limit)
 * surfaces as this screen's not-found view with a retry — not the root
 * boundary unmounting the whole app (plan 0013 §5).
 */
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
