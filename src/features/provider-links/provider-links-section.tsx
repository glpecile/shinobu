import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon, type IconSourceId } from '@/components/provider-icon';
import { openExternalUrl } from '@/lib/open-external-url';
import { tmdbItemUrl } from '@/lib/providers/external-urls';
import { PROVIDERS } from '@/lib/providers/registry';
import { providerLinksFor } from '@/lib/providers/provider-links';
import { useThemeColor } from '@/lib/theme-color';
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
 *
 * TMDB rides along at the end whenever the item carries a TMDB id. It is
 * keyed by `IconSourceId` rather than `ProviderId` because it isn't a
 * provider — it has no session to be connected to, so unlike the pills before
 * it, it shows on the id alone.
 */
export function ProviderLinksSection({ item }: { item: NormalizedMediaItem }) {
  const connected = useConnectedProviders();
  const muted = useThemeColor('--color-muted');
  const tmdb = tmdbItemUrl(item);
  const links: { id: IconSourceId; label: string; url: string }[] = [
    ...providerLinksFor(item, connected).map(({ provider, url }) => ({
      id: provider,
      label: PROVIDERS[provider].label,
      url,
    })),
    ...(tmdb != null ? [{ id: 'tmdb' as const, label: 'TMDB', url: tmdb }] : []),
  ];

  if (links.length === 0) return null;

  return (
    <View className="mt-8">
      <Text className="text-xl font-display text-foreground mb-4">View on</Text>
      <View className="flex-row flex-wrap gap-2">
        {links.map(({ id, label, url }) => (
          <PresstableOpacity
            className="flex-row items-center gap-2 bg-surface border border-border rounded-full px-4 py-2"
            key={id}
            onPress={() => openExternalUrl(url)}
          >
            <ProviderIcon id={id} size={16} />
            <Text className="text-foreground font-sans text-sm">{label}</Text>
            <Ionicons color={muted} name="open-outline" size={12} />
          </PresstableOpacity>
        ))}
      </View>
    </View>
  );
}
