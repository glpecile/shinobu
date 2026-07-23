import { useTraktMediaImages } from '@/state/queries/trakt';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * The art an Up Next card shows: the show's backdrop (landscape framing is the
 * point of the treatment), falling back to its poster and then to the dark
 * placeholder (KTD-9).
 *
 * Recovery is per rendered card and cached forever — Trakt's watched payloads
 * have carried no images at all since the 2026 API change, so the item arrives
 * artless and `useTraktMediaImages` fetches only for the cards on screen. No
 * section-wide prefetch.
 */
export function useCardArt(item: NormalizedMediaItem): string {
  const recovered = useTraktMediaImages(item);
  return (
    item.backdropImage ??
    recovered.backdropImage ??
    (recovered.coverImage !== '' ? recovered.coverImage : item.coverImage)
  );
}
