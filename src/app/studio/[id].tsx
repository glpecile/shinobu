import { useLocalSearchParams, useRouter } from 'expo-router';
import { Suspense } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { FloatingBackButton } from '@/components/floating-back-button';
import Head from '@/components/head';
import { Image } from '@/components/image';
import { MediaCarousel } from '@/components/media-carousel';
import { PosterPlaceholder } from '@/components/poster-placeholder';
// Layout-generic despite the name — the studio page shares the person
// page's header-plus-rows shape, so its skeleton and miss state fit as-is.
import { PersonNotFound, PersonSkeleton } from '@/features/person';
import { routes } from '@/lib/routes';
import { useSuspenseTmdbStudioQuery } from '@/state/queries/tmdb';

function StudioContent({ tmdbId }: { tmdbId: number }) {
  const { data } = useSuspenseTmdbStudioQuery({ tmdbId });
  const router = useRouter();
  const { company, rows } = data;

  return (
    <>
      <Head>
        <title>{`${company.name} — Shinobu`}</title>
      </Head>
      <View className="w-full max-w-4xl self-center px-6 pt-28">
        <View className="flex-row items-center gap-5 mb-8">
          {company.logo !== '' ? (
            // Logos are wide transparent PNGs — contain, on a surface tile
            // so white-on-transparent marks stay visible in dark mode. Not
            // zoomable: blowing a small vector-ish logo up full-screen looks
            // broken, unlike posters/headshots.
            <Image
              source={{ uri: company.logo }}
              className="w-28 h-28 rounded-card bg-surface border border-border p-2"
              contentFit="contain"
            />
          ) : (
            <PosterPlaceholder className="w-28 h-28 rounded-card" />
          )}
          <View className="flex-1">
            <Text className="text-3xl font-display text-foreground">
              {company.name}
            </Text>
            {company.headquarters != null && (
              <Text className="text-muted font-sans text-sm mt-1.5">
                {company.headquarters}
              </Text>
            )}
          </View>
        </View>
      </View>
      {/* px-2 + the carousel's internal px-4 lines rows up with the px-6 header. */}
      <View className="w-full max-w-4xl self-center px-2 pb-12">
        {rows.map((row) => (
          <MediaCarousel
            collapseKey={`studio-${row.title.toLowerCase().replace(/\s+/g, '-')}`}
            items={row.items}
            key={row.title}
            onItemPress={(item) => router.push(routes.details(item.id))}
            title={row.title}
          />
        ))}
      </View>
    </>
  );
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
