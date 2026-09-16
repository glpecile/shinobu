import { View } from 'react-native';

import { PosterFace } from '@/components/poster-face';
import { PresstableScale } from '@/components/presstable';
import { Section } from '@/components/section';
import { usePushRoute } from '@/lib/navigation';
import { PROVIDERS } from '@/lib/providers/registry';
import { routes } from '@/lib/routes';
import { useAniListIdByTmdbQuery } from '@/state/queries/mapping';
import { useDeepLinkItem } from '@/state/queries/resolve-item';
import { useTmdbToken } from '@/state/session/tmdb-token';
import type { NormalizedMediaItem } from '@/types/media';

import { detailVariants, type DetailVariant } from './variants';

const LABELS = { tmdb: 'TMDB', anilist: PROVIDERS.anilist.label } as const;

/** The item's other details pages, as posters in the watchlist wall's look. */
export function DetailVariantsSection({ item }: { item: NormalizedMediaItem }) {
  // A TMDB page resolves cold only by fetching it, which takes the token.
  const hasTmdb = useTmdbToken() !== '';
  const anilist = useAniListIdByTmdbQuery(item).data;
  const variants = detailVariants(
    anilist != null ? { ...item, externalIds: { ...item.externalIds, anilist } } : item,
  ).filter((variant) => hasTmdb || variant.source !== 'tmdb');

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
