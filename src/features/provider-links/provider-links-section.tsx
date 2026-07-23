import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { openExternalUrl } from '@/lib/open-external-url';
import { PROVIDERS } from '@/lib/providers/registry';
import { providerLinksFor } from '@/lib/providers/provider-links';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * The closing "View on" pill section (plan 0023 R2/R3): source provider
 * first, then every connected provider with a buildable URL. Links derive
 * synchronously from the already-resolved item — no query, no boundary, no
 * skeleton (KTD-4) — so this renders as a plain conditional right after the
 * credits `SuspenseSection`, never wrapped in one itself. Hidden entirely
 * when no provider yields a link (e.g. a TV item with only Letterboxd
 * connected).
 */
export function ProviderLinksSection({ item }: { item: NormalizedMediaItem }) {
  const connected = useConnectedProviders();
  const muted = useCSSVariable('--color-muted');
  const mutedColor = typeof muted === 'string' ? muted : undefined;
  const links = providerLinksFor(item, connected);

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
