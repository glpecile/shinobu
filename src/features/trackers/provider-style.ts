import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import type { MediaType } from '@/types/media';

const MEDIA_TYPE_LABEL: Record<MediaType, string> = {
  MOVIE: 'Movies',
  TV: 'TV',
  ANIME: 'Anime',
  MANGA: 'Manga',
  BOOK: 'Books',
};

/**
 * What this provider tracks, read off its registry capabilities rather than
 * hardcoded per card — a provider that gains or loses a media type relabels
 * itself (AGENTS.md: widen `PROVIDERS`, nothing else).
 */
export function capabilityLabels(id: ProviderId): string[] {
  return PROVIDERS[id].mediaTypes.map((type) => MEDIA_TYPE_LABEL[type]);
}
