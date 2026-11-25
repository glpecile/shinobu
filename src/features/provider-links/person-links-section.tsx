import { LinkPill } from '@/components/link-pill';
import { ProviderIcon } from '@/components/provider-icon';
import { Section } from '@/components/section';
import { openExternalUrl } from '@/lib/open-external-url';
import { providerPersonUrl, type UrlPerson } from '@/lib/providers/external-urls';
import type { ProviderLink } from '@/lib/providers/provider-links';
import { PROVIDERS } from '@/lib/providers/registry';
import { Provider } from '@/lib/providers/types';
import { useAniListStaffIdQuery } from '@/state/queries/anilist';
import { useConnectedProviders } from '@/state/session';

import { ProviderLinkRows } from './provider-link-row';

export function PersonLinksSection({
  person,
  enabled = true,
  variant = 'pills',
  onOpened,
}: {
  person: UrlPerson;
  enabled?: boolean;
  variant?: 'pills' | 'rows';
  onOpened?: () => void;
}) {
  const connected = useConnectedProviders();
  const staffId = useAniListStaffIdQuery({
    name: person.name,
    enabled:
      enabled &&
      connected.includes(Provider.AniList) &&
      person.anilistId == null &&
      person.hardcoverId == null,
  });
  const anilistId = person.anilistId ?? staffId.data ?? undefined;

  const providers = person.hardcoverId == null ? connected : [Provider.Hardcover];
  const links: ProviderLink[] = [];
  for (const provider of providers) {
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
    <Section>
      <Section.Header>
        <Section.Title>View on</Section.Title>
      </Section.Header>
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
    </Section>
  );
}
