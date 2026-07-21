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
import { PersonNotFound, PersonSkeleton } from '@/features/person';
import { initials } from '@/lib/initials';
import { routes } from '@/lib/routes';
import { useSuspenseTmdbPersonQuery } from '@/state/queries/tmdb';
import type { NormalizedPerson } from '@/types/media';

/**
 * TMDB sends bare calendar dates (YYYY-MM-DD). Parsing them through
 * `new Date(string)` lands at UTC midnight, which `toLocaleDateString`
 * would render a day early west of Greenwich — so the date is formatted
 * in UTC explicitly. Display-only; never compared against "now".
 */
function formatDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Whole years between two bare dates (UTC-parsed like `formatDate`) — the
 * person's age, or age at death when `until` is the deathday.
 */
function yearsBetween(from: string, until: Date): number | null {
  const [year, month, day] = from.split('-').map(Number);
  if (!year || !month || !day) return null;
  const hadBirthday =
    until.getUTCMonth() + 1 > month ||
    (until.getUTCMonth() + 1 === month && until.getUTCDate() >= day);
  const age = until.getUTCFullYear() - year - (hadBirthday ? 0 : 1);
  return age >= 0 ? age : null;
}

/** "Acting · Nov 12, 1980 (45) · London, Ontario, Canada" — TMDB has no
 * height field, so age is the one derivable extra stat. */
function metaLine(person: NormalizedPerson): string {
  let lifespan: string | null = null;
  if (person.birthday != null) {
    if (person.deathday != null) {
      const [y, m, d] = person.deathday.split('-').map(Number);
      const died = y && m && d ? new Date(Date.UTC(y, m - 1, d)) : null;
      const age = died != null ? yearsBetween(person.birthday, died) : null;
      lifespan = `${formatDate(person.birthday)} – ${formatDate(person.deathday)}${
        age != null ? ` (${age})` : ''
      }`;
    } else {
      const age = yearsBetween(person.birthday, new Date());
      lifespan = `${formatDate(person.birthday)}${age != null ? ` (${age})` : ''}`;
    }
  }
  return [person.knownForDepartment ?? null, lifespan, person.birthplace ?? null]
    .filter((part) => part != null)
    .join(' · ');
}

function PersonContent({ tmdbId }: { tmdbId: number }) {
  const { data } = useSuspenseTmdbPersonQuery({ tmdbId });
  const router = useRouter();
  const { person, rows } = data;
  const meta = metaLine(person);
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
            onItemActions={openActions}
            onItemPress={(item) => router.push(routes.details(item.id))}
            subtitles={row.details}
            title={row.role}
          />
        ))}
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
