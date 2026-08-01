import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { openExternalUrl } from '@/lib/open-external-url';
import { providerStudioUrl, type UrlStudio } from '@/lib/providers/external-urls';
import type { ProviderLink } from '@/lib/providers/provider-links';
import { PROVIDERS } from '@/lib/providers/registry';
import { useAniListStudioIdQuery } from '@/state/queries/anilist';
import { useConnectedProviders } from '@/state/session';

/**
 * The `PersonLinksSection` sibling for studios (plan 0035 R8/R10) — same pills,
 * same rules, different subject. Only Letterboxd and AniList have an addressable
 * studio surface; Trakt, Serializd and Simkl have none at all, so this gates on
 * connected providers alone.
 *
 * Letterboxd's link is a slug built from the name. AniList's needs a numeric id:
 * an AniList-sourced studio already carries one (`NormalizedStudio.anilistId`,
 * free — the credits payload always had it), and everything else resolves by
 * name search behind `enabled`. Unresolved or no confident match → **no AniList
 * pill**, never a search URL (R13).
 */
export function StudioLinksSection({
  studio,
  enabled = true,
}: {
  studio: UrlStudio;
  enabled?: boolean;
}) {
  const connected = useConnectedProviders();
  const muted = useCSSVariable('--color-muted');
  const mutedColor = typeof muted === 'string' ? muted : undefined;
  // Skipped entirely for a studio that already knows its id, and for a user
  // with no AniList connected (the pill wouldn't render either way).
  const studioId = useAniListStudioIdQuery({
    name: studio.name,
    enabled: enabled && connected.includes('anilist') && studio.anilistId == null,
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

  return (
    <View className="mt-6">
      <Text className="text-foreground font-sans-semibold text-sm mb-2">
        View on
      </Text>
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
