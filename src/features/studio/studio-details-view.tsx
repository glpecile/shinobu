import { Text, View } from 'react-native';

import Head from '@/components/head';
import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { useFloatingBackButtonClearance } from '@/components/floating-back-button';
import { FloatingShareButton } from '@/components/floating-share-button';
import { ScrolledTitle } from '@/components/scrolled-title';
import { CopyTitle } from '@/features/copy-title/copy-title';
import { CreditTimeline } from '@/features/credit-timeline/credit-timeline';
import { catalogueFilmography } from '@/features/credit-timeline/group';
import { StudioLinksSection } from '@/features/provider-links/studio-links-section';
import { usePushRoute } from '@/lib/navigation';
import type { NormalizedStudioDetails } from '@/lib/providers/tmdb/normalize';
import { routes } from '@/lib/routes';

export function StudioDetailsView({ company, rows }: NormalizedStudioDetails) {
  const headerTop = useFloatingBackButtonClearance();
  const pushRoute = usePushRoute();
  const { openActions, sheetProps } = useCardActions();
  const filmography = catalogueFilmography(rows.flatMap((row) => row.items));

  return (
    <>
      <Head>
        <title>{`${company.name} — Shinobu`}</title>
      </Head>
      <CreditTimeline
        filmography={filmography}
        footer={
          <View className="px-6">
            <StudioLinksSection studio={{ name: company.name }} />
          </View>
        }
        header={
          <View className="px-6 pb-6" style={{ paddingTop: headerTop }}>
            <View className="flex-row items-center gap-5">
              {company.logo !== '' ? (
                <Image
                  source={{ uri: company.logo }}
                  className="w-28 h-28 rounded-lg bg-logo-tile p-2"
                  contentFit="contain"
                />
              ) : (
                <PosterPlaceholder className="w-28 h-28 rounded-lg" />
              )}
              <View className="flex-1 min-w-0">
                <ScrolledTitle.Anchor>
                  <CopyTitle title={company.name} tmdbId={company.tmdbId} />
                </ScrolledTitle.Anchor>
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
        onItemPress={(item) => pushRoute(routes.details(item.id, item.type))}
      />
      <ScrolledTitle.Bar title={company.name} trailingAction />
      <FloatingShareButton href={routes.studio(company.tmdbId)} />
      <CardActionsSheet {...sheetProps} />
    </>
  );
}
