import {
  useLocalSearchParams,
  useRouter,
  type ErrorBoundaryProps,
} from 'expo-router';
import { Suspense } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ExpandableText } from '@/components/expandable-text';
import { FloatingBackButton } from '@/components/floating-back-button';
import Head from '@/components/head';
import { MediaCarousel } from '@/components/media-carousel';
import { ZoomableImage } from '@/components/zoomable-image';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { PersonNotFound, PersonSkeleton, personMetaLine } from '@/features/person';
import { PersonLinksSection } from '@/features/provider-links/person-links-section';
import { initials } from '@/lib/initials';
import { ACTING_ROLE } from '@/lib/providers/tmdb/normalize';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { useSuspenseTmdbPersonQuery } from '@/state/queries/tmdb';

function PersonContent({ tmdbId }: { tmdbId: number }) {
  const { data } = useSuspenseTmdbPersonQuery({ tmdbId });
  const pushRoute = usePushRoute();
  const { person, rows } = data;
  const meta = personMetaLine(person);
  // Same per-card actions dialog as the home feed.
  const { openActions, sheetProps } = useCardActions();

  return (
    <>
      <Head>
        <title>{`${person.name} — Shinobu`}</title>
        {person.biography != null && (
          <meta content={person.biography} name="description" />
        )}
      </Head>
      <View className="w-full max-w-4xl self-center px-6 pt-28">
        <View className="flex-row items-center gap-5 mb-6">
          {person.headshot !== '' ? (
            <ZoomableImage
              alt={person.name}
              uri={person.headshot}
              zoomUri={person.headshotFull}
              type="circle-avi"
              className="w-28 h-28 rounded-full bg-surface border border-border"
              contentFit="cover"
            />
          ) : (
            <View className="w-28 h-28 rounded-full bg-surface border border-border items-center justify-center">
              <Text className="text-muted font-sans-semibold text-3xl">
                {initials(person.name)}
              </Text>
            </View>
          )}
          <View className="flex-1">
            <Text className="text-3xl font-display text-foreground">
              {person.name}
            </Text>
            {meta !== '' && (
              <Text className="text-muted font-sans text-sm mt-1.5">{meta}</Text>
            )}
          </View>
        </View>
        {person.biography != null && (
          <ExpandableText lines={4} text={person.biography} />
        )}
      </View>
      {/* px-2 + the carousel's internal px-4 lines rows up with the px-6 header. */}
      <View className="w-full max-w-4xl self-center px-2 pb-12">
        {rows.map((row) => (
          <MediaCarousel
            collapseKey={`person-${row.role.toLowerCase()}`}
            items={row.items}
            key={row.role}
            // The card clamps the credit to one line ("2026 · Frank Castle /
            // …"), so the long-press carries the whole of it into the sheet,
            // with the face: the answer to "who is this person here?" without
            // leaving the page.
            onItemActions={(item) =>
              openActions(item, {
                name: person.name,
                headshot: person.headshot,
                role: row.roles[item.id] ?? '',
                kind: row.role === ACTING_ROLE ? 'cast' : 'crew',
              })
            }
            onItemPress={(item) => pushRoute(routes.details(item.id))}
            subtitles={row.details}
            title={row.role}
          />
        ))}
        {/* px-4 matches the carousels' internal padding, so the "View on"
            pills line up with the rows above and the px-6 header. */}
        <View className="px-4">
          <PersonLinksSection person={person} />
        </View>
      </View>
      <CardActionsSheet {...sheetProps} />
    </>
  );
}

export default function PersonScreen() {
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
      <PersonNotFound detail="This person page doesn't exist." onGoBack={goBack} />
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1">
        <Suspense fallback={<PersonSkeleton />}>
          <PersonContent tmdbId={tmdbId} />
        </Suspense>
      </ScrollView>
      <FloatingBackButton onPress={goBack} />
    </View>
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
