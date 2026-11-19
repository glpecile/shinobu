import { providerItemUrl, type UrlEpisode } from './external-urls';
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
  const separatorIndex = item.id.indexOf('-');
  const prefix = separatorIndex === -1 ? item.id : item.id.slice(0, separatorIndex);
  return PROVIDER_IDS.has(prefix) ? (prefix as ProviderId) : null;
}

export interface ProviderLink {
  provider: ProviderId;
  url: string;
}

type LinkItem = Pick<NormalizedMediaItem, 'id' | 'type' | 'isFilm' | 'externalIds'> &
  Partial<Pick<NormalizedMediaItem, 'bridgedAniList'>>;

/**
 * The provider links for `item` (plan 0023 R3/KTD-3): the source provider
 * first — linked even if currently disconnected, since it's where the item
 * came from — then every other connected provider, deduped, filtered to
 * buildable URLs. The card-actions sheet passes no connected provider, or
 * AniList alone for a book grouped under an AniList entry, whose own card
 * dropped out of the screen (plan 0117 B6).
 */
export function providerLinksFor(
  item: LinkItem,
  connected: readonly ProviderId[],
  episode?: UrlEpisode,
): ProviderLink[] {
  const source = sourceProviderOf(item);
  const candidates: ProviderId[] = [
    ...(source != null ? [source] : []),
    ...connected.filter((provider) => provider !== source),
  ];
  const links: ProviderLink[] = [];
  for (const provider of candidates) {
    const url = providerItemUrl(provider, item, episode);
    if (url != null) links.push({ provider, url });
  }
  return links;
}
