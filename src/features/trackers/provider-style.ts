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

export function capabilityLabels(id: ProviderId): string[] {
  return PROVIDERS[id].mediaTypes.map((type) => MEDIA_TYPE_LABEL[type]);
}
