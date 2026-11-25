import { Text, View } from 'react-native';

import { LinkPill } from '@/components/link-pill';
import { ProviderIcon } from '@/components/provider-icon';
import { openExternalUrl } from '@/lib/open-external-url';
import { providerStudioUrl, type UrlStudio } from '@/lib/providers/external-urls';
import type { ProviderLink } from '@/lib/providers/provider-links';
import { PROVIDERS } from '@/lib/providers/registry';
import { Provider } from '@/lib/providers/types';
import { useAniListStudioIdQuery } from '@/state/queries/anilist';
import { useConnectedProviders } from '@/state/session';

import { ProviderLinkRows } from './provider-link-row';

export function StudioLinksSection({
  studio,
  enabled = true,
  variant = 'pills',
  onOpened,
}: {
  studio: UrlStudio;
  enabled?: boolean;
  variant?: 'pills' | 'rows';
  onOpened?: () => void;
}) {
  const connected = useConnectedProviders();
  const studioId = useAniListStudioIdQuery({
    name: studio.name,
    enabled: enabled && connected.includes(Provider.AniList) && studio.anilistId == null,
  });
  const anilistId = studio.anilistId ?? studioId.data ?? undefined;

  const links: ProviderLink[] = [];
  for (const provider of connected) {
    const url = providerStudioUrl(provider, {
      name: studio.name,
      ...(anilistId != null ? { anilistId } : {}),
    });
    if (url != null) links.push({ provider, url });
  }

  if (links.length === 0) return null;

  if (variant === 'rows')
    return <ProviderLinkRows className="mt-2" links={links} onOpened={onOpened} />;

  return (
    <View className="mt-6">
      <Text className="text-foreground font-sans-semibold text-sm mb-2">
        View on
      </Text>
      <LinkPill.Rail>
        {links.map(({ provider, url }) => (
          <LinkPill
            external
            icon={<ProviderIcon id={provider} size={16} />}
            key={provider}
            label={PROVIDERS[provider].label}
            onPress={() => openExternalUrl(url)}
          />
        ))}
      </LinkPill.Rail>
    </View>
  );
}
