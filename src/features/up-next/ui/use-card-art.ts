import { useTraktMediaImages } from '@/state/queries/trakt';
import type { NormalizedMediaItem } from '@/types/media';

/** Trakt's watched payloads carry no images, so `useTraktMediaImages` recovers art per rendered card. */
export function useCardArt(item: NormalizedMediaItem): string {
  const recovered = useTraktMediaImages(item);
  return (
    item.backdropImage ||
    recovered.backdropImage ||
    (recovered.coverImage !== '' ? recovered.coverImage : item.coverImage)
  );
}
