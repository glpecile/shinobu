import { Text, View } from 'react-native';

import Head from '@/components/head';
import { Image } from '@/components/image';
import { MediaCarousel } from '@/components/media-carousel';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { usePushRoute } from '@/lib/navigation';
import type { NormalizedStudioDetails } from '@/lib/providers/tmdb/normalize';
import { routes } from '@/lib/routes';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * The release year per card (plan 0035 R15). A studio row has no role text, so
 * unlike the person page's filmography the year *is* the whole subtitle — a
 * slot that was simply empty until now. Undated titles get no key at all, which
 * leaves them subtitle-less and keeps their sorts-first position (R16).
 */
function releaseYears(
  items: readonly NormalizedMediaItem[],
): Record<string, string> {
  return Object.fromEntries(
    items
      .filter((item) => item.year != null)
      .map((item) => [item.id, String(item.year)]),
  );
}

/**
 * The studio page itself, shared by `/studio/[id]` and `/studio/lookup` — the
 * two differ only in how the company id was resolved.
 */
export function StudioDetailsView({ company, rows }: NormalizedStudioDetails) {
  const pushRoute = usePushRoute();
  // Same per-card actions dialog as the home feed.
  const { openActions, sheetProps } = useCardActions();

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
            onItemActions={openActions}
            onItemPress={(item) => pushRoute(routes.details(item.id))}
            subtitles={releaseYears(row.items)}
            title={row.title}
          />
        ))}
      </View>
      <CardActionsSheet {...sheetProps} />
    </>
  );
}
