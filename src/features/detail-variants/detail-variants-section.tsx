import { View } from 'react-native';

import { LinkPill } from '@/components/link-pill';
import { ProviderIcon } from '@/components/provider-icon';
import { Section } from '@/components/section';
import { usePushRoute } from '@/lib/navigation';
import { PROVIDERS } from '@/lib/providers/registry';
import { routes } from '@/lib/routes';
import { useAniListIdByTmdbQuery } from '@/state/queries/mapping';
import { useTmdbToken } from '@/state/session/tmdb-token';
import type { NormalizedMediaItem } from '@/types/media';

import { detailVariants } from './variants';

const LABELS = { tmdb: 'TMDB', anilist: PROVIDERS.anilist.label } as const;

/** In-app pills to the item's other details pages, beside "View on"'s external ones. */
export function DetailVariantsSection({ item }: { item: NormalizedMediaItem }) {
  const pushRoute = usePushRoute();
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
      <View className="flex-row flex-wrap gap-2">
        {variants.map(({ source, id }) => (
          <LinkPill
            icon={<ProviderIcon id={source} size={16} />}
            key={id}
            label={LABELS[source]}
            onPress={() => pushRoute(routes.details(id))}
          />
        ))}
      </View>
    </Section>
  );
}
