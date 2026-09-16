import { View } from 'react-native';

import { LinkPill } from '@/components/link-pill';
import { ProviderIcon, type IconSourceId } from '@/components/provider-icon';
import { Section } from '@/components/section';
import { openExternalUrl } from '@/lib/open-external-url';
import { tmdbItemUrl } from '@/lib/providers/external-urls';
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
 *
 * TMDB rides along at the end whenever the item carries a TMDB id. It is
 * keyed by `IconSourceId` rather than `ProviderId` because it isn't a
 * provider — it has no session to be connected to, so unlike the pills before
 * it, it shows on the id alone.
 */
export function ProviderLinksSection({ item }: { item: NormalizedMediaItem }) {
  const connected = useConnectedProviders();
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
    <Section>
      <Section.Header>
        <Section.Title>View on</Section.Title>
      </Section.Header>
      <View className="flex-row flex-wrap gap-2">
        {links.map(({ id, label, url }) => (
          <LinkPill
            external
            icon={<ProviderIcon id={id} size={16} />}
            key={id}
            label={label}
            onPress={() => openExternalUrl(url)}
          />
        ))}
      </View>
    </Section>
  );
}
