import { useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';

import { PosterFace } from '@/components/poster-face';
import { PresstableScale } from '@/components/presstable';
import { Section } from '@/components/section';
import { usePushRoute } from '@/lib/navigation';
import { PROVIDERS } from '@/lib/providers/registry';
import { routes } from '@/lib/routes';
import {
  simklLookupParamsFor,
  useAniListIdByTmdbQuery,
  useSimklLookupQuery,
} from '@/state/queries/mapping';
import { useDeepLinkItem } from '@/state/queries/resolve-item';
import { findLetterboxdTwinInCache } from '@/state/queries/watchlist-cache';
import { useTmdbToken } from '@/state/session/tmdb-token';
import type { NormalizedMediaItem } from '@/types/media';

import { detailVariants, type DetailVariant } from './variants';

const LABELS = {
  tmdb: 'TMDB',
  anilist: PROVIDERS.anilist.label,
  simkl: PROVIDERS.simkl.label,
  letterboxd: PROVIDERS.letterboxd.label,
} as const;

/** The item's other details pages, as posters in the watchlist wall's look. */
export function DetailVariantsSection({ item }: { item: NormalizedMediaItem }) {
  // A TMDB page resolves cold only by fetching it, which takes the token.
  const hasTmdb = useTmdbToken() !== '';
  const anilist = useAniListIdByTmdbQuery(item).data;
  // Simkl's page is public: any foreign id names it, nothing to connect.
  const simkl = useSimklLookupQuery(simklLookupParamsFor(item)).data?.externalIds.simkl;
  // Letterboxd's is cache-only — see `findLetterboxdTwinInCache`.
  const letterboxd = findLetterboxdTwinInCache(useQueryClient(), item)?.externalIds.letterboxd;
  const variants = detailVariants({
    ...item,
    externalIds: {
      ...item.externalIds,
      ...(anilist != null ? { anilist } : {}),
      ...(simkl != null ? { simkl } : {}),
      ...(letterboxd != null ? { letterboxd } : {}),
    },
  }).filter((variant) => hasTmdb || variant.source !== 'tmdb');

  if (variants.length === 0) return null;

  return (
    <Section>
      <Section.Header>
        <Section.Title>Variants</Section.Title>
      </Section.Header>
      <View className="flex-row flex-wrap gap-3">
        {variants.map((variant) => (
          <VariantPoster item={item} key={variant.id} variant={variant} />
        ))}
      </View>
    </Section>
  );
}

function VariantPoster({ item, variant }: { item: NormalizedMediaItem; variant: DetailVariant }) {
  const pushRoute = usePushRoute();
  // A Letterboxd twin has no fetch; its cover is the page's own.
  const preview = useDeepLinkItem(variant.id);

  return (
    <View className="w-28" style={{ aspectRatio: 2 / 3 }}>
      <PresstableScale
        accessibilityLabel={`${preview?.title ?? item.title} on ${LABELS[variant.source]}`}
        className="w-full h-full rounded-md overflow-hidden border border-border/40 bg-surface"
        onPress={() => pushRoute(routes.details(variant.id))}
      >
        {/* The page's own poster stands in until the variant's lands. */}
        <PosterFace marks={[variant.source]} uri={preview?.coverImage || item.coverImage} />
      </PresstableScale>
    </View>
  );
}
