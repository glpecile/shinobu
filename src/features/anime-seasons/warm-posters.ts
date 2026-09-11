import { useSuspenseQuery } from '@tanstack/react-query';

import { prefetchImages } from '@/components/image';
import type { NormalizedMediaItem } from '@/types/media';

/** The most a slow image CDN may hold a wall back; past it, posters fill in as they land. */
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
 * Suspends until the wall's first screen of posters is in the image cache.
 * The wall swaps in as one piece, so its posters must be paintable on the
 * frame it mounts: the previous wall is already gone by then, and cells that
 * are still waiting on their image paint as bare background — a black flash on
 * every switch (docs/solutions/wall-swap-black-flash-posters-not-decoded.md).
 * Keyed under the wall's own query key, so it runs once per window and the
 * same transition that holds the old wall through the data fetch holds it
 * through this too.
 *
 * `count` is the caller's first screen, not a constant: the 24 this started
 * with was a desktop wall's above-the-fold (eight columns, three rows), and on
 * a phone that is three screens of posters the swap waits on before it may
 * paint — the gap between the control moving and the cards changing.
 *
 * Lives here, not in the query layer: `components/image` pulls in expo-image
 * and with it React Native's Flow sources, which `bun test` cannot load.
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
