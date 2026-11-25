import { useSuspenseQuery } from '@tanstack/react-query';

import { prefetchImages } from '@/components/image';
import type { NormalizedMediaItem } from '@/types/media';

const WARMUP_CAP_MS = 1200;

function warmPosters(items: NormalizedMediaItem[], count: number): Promise<void> {
  const uris = items
    .slice(0, count)
    .map((item) => item.coverImage)
    .filter((uri) => uri !== '');
  if (uris.length === 0) return Promise.resolve();
  return Promise.race([
    prefetchImages(uris).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, WARMUP_CAP_MS)),
  ]);
}

/**
 * Suspends until the first `count` posters are cached to prevent a black flash on
 * wall swap (docs/solutions/wall-swap-black-flash-posters-not-decoded.md).
 * Lives outside `state/queries/` because `components/image` pulls in `expo-image`
 * and React Native's Flow sources, which `bun test` cannot load.
 */
export function useWarmPosters(
  queryKey: readonly unknown[],
  items: NormalizedMediaItem[],
  count: number,
): void {
  useSuspenseQuery({
    queryKey: [...queryKey, 'posters'],
    queryFn: () => warmPosters(items, count).then(() => true),
    staleTime: Infinity,
  });
}
