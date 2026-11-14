import { useQueryErrorResetBoundary } from '@tanstack/react-query';
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
import type { HardcoverAuthorKey } from '@/lib/providers/hardcover/reads';
import { useSuspenseHardcoverAuthorQuery } from '@/state/queries/hardcover';
import {
  useSuspenseAniListStaffQuery,
  useSuspenseImdbPersonQuery,
} from '@/state/queries/person-details';
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

function HardcoverAuthorDetails({ author }: { author: HardcoverAuthorKey }) {
  const { data } = useSuspenseHardcoverAuthorQuery(author);
  return <PersonDetailsView {...data} />;
}

/** Every Hardcover read needs the member's session, which the web prerender doesn't have. */
function HardcoverAuthorContent({ author, onGoBack }: { author: HardcoverAuthorKey; onGoBack: () => void }) {
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
  return <HardcoverAuthorDetails author={author} />;
}

function ImdbPersonContent({ imdbId, onGoBack }: { imdbId: string; onGoBack: () => void }) {
  const { data } = useSuspenseImdbPersonQuery({ imdbId });
  if (data == null) {
    return <PersonNotFound detail="No TMDB person matches this IMDb page." onGoBack={onGoBack} />;
  }
  return <PersonDetailsView {...data} />;
}

function positiveId(id: string): number | null {
  const value = Number(id);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** The page behind a `/person/<provider>/<id>` path, or null when the id isn't that provider's. */
function personPage(provider: string, id: string, onGoBack: () => void) {
  switch (provider) {
    case 'tmdb': {
      const tmdbId = positiveId(id);
      return tmdbId == null ? null : { content: <PersonContent tmdbId={tmdbId} />, href: routes.person(tmdbId) };
    }
    case 'imdb':
      return /^nm[0-9]+$/.test(id)
        ? { content: <ImdbPersonContent imdbId={id} onGoBack={onGoBack} />, href: routes.imdbPerson(id) }
        : null;
    case Provider.AniList: {
      const anilistId = positiveId(id);
      return anilistId == null
        ? null
        : { content: <AniListPersonContent anilistId={anilistId} />, href: routes.anilistPerson(anilistId) };
    }
    case Provider.Hardcover: {
      const authorId = positiveId(id);
      if (authorId != null) {
        return { content: <HardcoverAuthorContent author={{ id: authorId }} onGoBack={onGoBack} />, href: routes.hardcoverAuthor(authorId) };
      }
      const slug = /^authors-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(id)?.[1];
      return slug == null
        ? null
        : { content: <HardcoverAuthorContent author={{ slug }} onGoBack={onGoBack} />, href: routes.hardcoverAuthorBySlug(slug) };
    }
    default:
      return null;
  }
}

export default function PersonScreen() {
  const { provider, id } = useLocalSearchParams<{ provider: string; id: string }>();
  const router = useRouter();

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(routes.home);
    }
  }

  const page = personPage(provider, id, goBack);
  if (page == null) {
    return (
      <PersonNotFound detail="This person page doesn't exist." onGoBack={goBack} />
    );
  }

  return (
    <ScrolledTitle>
      <Suspense fallback={<><PersonSkeleton /><FloatingShareButton href={page.href} /></>}>
        {page.content}
      </Suspense>
      <FloatingBackButton onPress={goBack} />
    </ScrolledTitle>
  );
}

/**
 * Route-level containment: a failed fetch (no token, 404, rate limit)
 * surfaces as this screen's not-found view with a retry — not the root
 * boundary unmounting the whole app (plan 0013 §5).
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const router = useRouter();
  // A remount alone rethrows the cached query error, so clear it first.
  const { reset } = useQueryErrorResetBoundary();
  return (
    <PersonNotFound
      detail="This person couldn't be loaded."
      onGoBack={() =>
        router.canGoBack() ? router.back() : router.replace(routes.home)
      }
      onRetry={() => {
        reset();
        void retry();
      }}
    />
  );
}
