import { Text, View } from 'react-native';

import Head from '@/components/head';
import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { CreditTimeline } from '@/features/credit-timeline/credit-timeline';
import { catalogueFilmography } from '@/features/credit-timeline/group';
import { usePushRoute } from '@/lib/navigation';
import type { NormalizedStudioDetails } from '@/lib/providers/tmdb/normalize';
import { routes } from '@/lib/routes';

/**
 * The studio page itself, shared by `/studio/[id]` and `/studio/lookup` — the
 * two differ only in how the company id was resolved. The person page's
 * timeline with no roles: the format pill is the film/TV split.
 */
export function StudioDetailsView({ company, rows }: NormalizedStudioDetails) {
  const pushRoute = usePushRoute();
  // Same per-card actions dialog as the home feed.
  const { openActions, sheetProps } = useCardActions();
  const filmography = catalogueFilmography(rows.flatMap((row) => row.items));

  return (
    <>
      <Head>
        <title>{`${company.name} — Shinobu`}</title>
      </Head>
      <CreditTimeline
        filmography={filmography}
        header={
          <View className="px-6 pt-28">
            <View className="flex-row items-center gap-5">
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
        }
        onItemActions={(credit) => openActions(credit.item)}
        onItemPress={(item) => pushRoute(routes.details(item.id))}
      />
      <CardActionsSheet {...sheetProps} />
    </>
  );
}
