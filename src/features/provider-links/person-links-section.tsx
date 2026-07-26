import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { openExternalUrl } from '@/lib/open-external-url';
import { providerPersonUrl, type UrlPerson } from '@/lib/providers/external-urls';
import type { ProviderLink } from '@/lib/providers/provider-links';
import { PROVIDERS } from '@/lib/providers/registry';
import { useConnectedProviders } from '@/state/session';

/**
 * The `ProviderLinksSection` sibling for `/person/[id]` — same pill treatment,
 * same `openExternalUrl` hand-off, different subject. A person has no *source*
 * provider (TMDB is the single source of truth for people, and TMDB is a
 * metadata source, never a link target), so unlike the item section this gates
 * purely on connected providers: only Letterboxd and AniList have an
 * addressable person surface, and each is linked only while connected.
 *
 * Links derive synchronously from the already-resolved person — no query, no
 * boundary, no skeleton — so this renders as a plain conditional after the
 * credit carousels. Hidden entirely when neither provider is connected.
 */
export function PersonLinksSection({ person }: { person: UrlPerson }) {
  const connected = useConnectedProviders();
  const muted = useCSSVariable('--color-muted');
  const mutedColor = typeof muted === 'string' ? muted : undefined;

  const links: ProviderLink[] = [];
  for (const provider of connected) {
    const url = providerPersonUrl(provider, person);
    if (url != null) links.push({ provider, url });
  }

  if (links.length === 0) return null;

  return (
    <View className="mt-8">
      <Text className="text-xl font-display text-foreground mb-4">View on</Text>
      <View className="flex-row flex-wrap gap-2">
        {links.map(({ provider, url }) => (
          <PresstableOpacity
            className="flex-row items-center gap-2 bg-surface border border-border rounded-full px-4 py-2"
            key={provider}
            onPress={() => openExternalUrl(url)}
          >
            <ProviderIcon id={provider} size={16} />
            <Text className="text-foreground font-sans text-sm">
              {PROVIDERS[provider].label}
            </Text>
            <Ionicons color={mutedColor} name="open-outline" size={12} />
          </PresstableOpacity>
        ))}
      </View>
    </View>
  );
}
