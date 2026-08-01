import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { openExternalUrl } from '@/lib/open-external-url';
import { providerPersonUrl, type UrlPerson } from '@/lib/providers/external-urls';
import type { ProviderLink } from '@/lib/providers/provider-links';
import { PROVIDERS } from '@/lib/providers/registry';
import { useAniListStaffIdQuery } from '@/state/queries/anilist';
import { useConnectedProviders } from '@/state/session';

import { ProviderLinkRows } from './provider-link-row';

/**
 * The `ProviderLinksSection` sibling for `/person/[id]` — same pill treatment,
 * same `openExternalUrl` hand-off, different subject. A person has no *source*
 * provider (TMDB is the single source of truth for people, and TMDB is a
 * metadata source, never a link target), so unlike the item section this gates
 * purely on connected providers: only Letterboxd and AniList have an
 * addressable person surface, and each is linked only while connected.
 *
 * Letterboxd's link derives synchronously from the name. AniList's does not:
 * its staff pages are numeric-id keyed (plan 0035 R11), so the id is resolved by
 * a name search behind `enabled` — and while it is unresolved, or when nothing
 * matched, **the AniList pill simply is not there**. No spinner, no placeholder,
 * and above all no fallback to a name-search URL, which is what this replaces:
 * most TMDB people have no AniList entry, so that link overwhelmingly opened an
 * empty search page (R13).
 *
 * `enabled` defaults on for the person route (mounted = wanted). A sheet passes
 * its own open flag so a rail of 20 cards costs 0 requests until one is
 * long-pressed — and `variant="rows"`, so the links land as full-width action
 * rows continuing the stack above them instead of a pill cluster.
 */
export function PersonLinksSection({
  person,
  enabled = true,
  variant = 'pills',
  onOpened,
}: {
  person: UrlPerson;
  enabled?: boolean;
  /** `'pills'` on a page, `'rows'` inside a sheet — see `ProviderLinkRow`. */
  variant?: 'pills' | 'rows';
  /** Forwarded to the rows variant (native-only sheet dismissal). */
  onOpened?: () => void;
}) {
  const connected = useConnectedProviders();
  const muted = useCSSVariable('--color-muted');
  const mutedColor = typeof muted === 'string' ? muted : undefined;
  // Only while AniList is connected *and* the section wants links: an
  // unconnected AniList renders no pill, so resolving its id would buy nothing.
  const staffId = useAniListStaffIdQuery({
    name: person.name,
    enabled: enabled && connected.includes('anilist') && person.anilistId == null,
  });
  const anilistId = person.anilistId ?? staffId.data ?? undefined;

  const links: ProviderLink[] = [];
  for (const provider of connected) {
    const url = providerPersonUrl(provider, {
      ...person,
      ...(anilistId != null ? { anilistId } : {}),
    });
    if (url != null) links.push({ provider, url });
  }

  if (links.length === 0) return null;

  if (variant === 'rows')
    return <ProviderLinkRows className="mt-2" links={links} onOpened={onOpened} />;

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
