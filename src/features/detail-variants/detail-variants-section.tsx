import { useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';

import { Collapse } from '@/components/collapse';
import { DisclosureChevron } from '@/components/disclosure-chevron';
import { PosterFace } from '@/components/poster-face';
import { PresstableOpacity, PresstableScale } from '@/components/presstable';
import { Rail } from '@/components/rail';
import { Section } from '@/components/section';
import { usePushRoute } from '@/lib/navigation';
import { PROVIDERS } from '@/lib/providers/registry';
import { Provider } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import {
  simklLookupParamsFor,
  useAniListIdByTmdbQuery,
  useSimklLookupQuery,
} from '@/state/queries/mapping';
import { useDeepLinkItem } from '@/state/queries/resolve-item';
import { findLetterboxdTwinInCache } from '@/state/queries/watchlist-cache';
import { setSectionCollapsed, useSectionCollapsed } from '@/state/prefs/collapsed-sections';
import { useTmdbToken } from '@/state/session/tmdb-token';
import type { NormalizedMediaItem } from '@/types/media';

import { detailVariants, type DetailVariant } from './variants';

const LABELS = {
  tmdb: 'TMDB',
  anilist: PROVIDERS[Provider.AniList].label,
  simkl: PROVIDERS[Provider.Simkl].label,
  letterboxd: PROVIDERS[Provider.Letterboxd].label,
} as const;

export function DetailVariantsSection({ item }: { item: NormalizedMediaItem }) {
  const open = !useSectionCollapsed('detail-variants', true);
  const hasTmdb = useTmdbToken() !== '';
  const anilist = useAniListIdByTmdbQuery(item).data;
  const simkl = useSimklLookupQuery(simklLookupParamsFor(item)).data?.externalIds.simkl;
  const letterboxd = findLetterboxdTwinInCache(useQueryClient(), item)?.externalIds.letterboxd;
  const variants = detailVariants(
    {
      ...item,
      externalIds: {
        ...item.externalIds,
        ...(anilist != null ? { anilist } : {}),
        ...(simkl != null ? { simkl } : {}),
        ...(letterboxd != null ? { letterboxd } : {}),
      },
    },
    letterboxd,
  ).filter((variant) => hasTmdb || variant.source !== 'tmdb');

  if (variants.length === 0) return null;

  return (
    <Section>
      <PresstableOpacity
        accessibilityLabel={`${open ? 'Collapse' : 'Expand'} Variants`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="min-h-11 flex-row items-center gap-2 self-start"
        onPress={() => setSectionCollapsed('detail-variants', open)}
        pressBehavior="immediate"
      >
        <Section.Title>Variants</Section.Title>
        <DisclosureChevron open={open} size={18} />
      </PresstableOpacity>
      <Collapse open={open}>
        <View className="mt-4">
          <Rail contentContainerClassName="gap-3">
            {variants.map((variant) => (
              <VariantPoster item={item} key={variant.id} variant={variant} />
            ))}
          </Rail>
        </View>
      </Collapse>
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
        className="w-full h-full rounded-lg overflow-hidden border border-hairline bg-surface"
        onPress={() => pushRoute(routes.details(variant.id, variant.type ?? item.type))}
      >
        <PosterFace marks={[variant.source]} uri={preview?.coverImage || item.coverImage} />
      </PresstableScale>
    </View>
  );
}
