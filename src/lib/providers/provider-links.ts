import { providerItemUrl } from './external-urls';
import { PROVIDERS } from './registry';
import type { ProviderId } from './types';
import type { NormalizedMediaItem } from '@/types/media';

const PROVIDER_IDS = new Set(Object.keys(PROVIDERS));

/**
 * Parses the `${providerId}-${nativeId}` shape documented on
 * `NormalizedMediaItem.id` (plan 0023 KTD-2): the first segment before the
 * first `-`, validated against the registry's `ProviderId` union. Null for
 * an unknown/invalid prefix (e.g. a TMDB-catalogue-resolved item) — callers
 * hide the row rather than guess.
 */
export function sourceProviderOf(item: Pick<NormalizedMediaItem, 'id'>): ProviderId | null {
  const prefix = item.id.slice(0, item.id.indexOf('-'));
  return PROVIDER_IDS.has(prefix) ? (prefix as ProviderId) : null;
}

export interface ProviderLink {
  provider: ProviderId;
  url: string;
}

type LinkItem = Pick<NormalizedMediaItem, 'id' | 'type' | 'isFilm' | 'externalIds'>;

/**
 * The provider links for `item` (plan 0023 R3/KTD-3): the source provider
 * first — linked even if currently disconnected, since it's where the item
 * came from — then every other connected provider, deduped, filtered to
 * buildable URLs. Shared by the card-actions sheet (takes `[0]`) and the
 * details "View on" section (renders all).
 */
export function providerLinksFor(
  item: LinkItem,
  connected: readonly ProviderId[],
): ProviderLink[] {
  const source = sourceProviderOf(item);
  const candidates: ProviderId[] = [
    ...(source != null ? [source] : []),
    ...connected.filter((provider) => provider !== source),
  ];
  const links: ProviderLink[] = [];
  for (const provider of candidates) {
    const url = providerItemUrl(provider, item);
    if (url != null) links.push({ provider, url });
  }
  return links;
}
