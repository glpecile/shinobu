import { Image as ExpoImage, type ImageProps } from 'expo-image';
import type { ComponentProps } from 'react';
import { withUniwind } from '@/lib/with-uniwind';

import { DURATION } from '@/lib/motion';

/**
 * The one place expo-image is imported. Uniwind resolves `className` natively
 * only for components wrapped in `withUniwind` — on a raw third-party
 * component the prop is silently dropped on iOS/Android (it only "works" on
 * web because the class name lands in the DOM where real CSS applies), which
 * left every poster sized 0×0 and invisible on native. Enforced by
 * no-restricted-imports in .oxlintrc.json.
 */
const StyledImage = withUniwind(ExpoImage);

/**
 * Artwork crossfades in rather than snapping, on the same beat a resolved
 * `SuspenseSection` uses. A default, not a per-call-site prop: every image here
 * arrives over the network, and a cached one paints before the fade can run.
 */
const DEFAULT_TRANSITION: ImageProps['transition'] = {
  duration: DURATION.swap,
  effect: 'cross-dissolve',
};

/**
 * `memory-disk`, not expo-image's `disk` default: on Android `disk` sets
 * Glide's `skipMemoryCache(true)`, so a poster is decoded from disk again
 * (40–110ms each) every time its card is re-mounted or recycled — the home
 * carousels' "posters die while scrolling". Glide's memory cache is a bounded
 * LRU sized from the screen, so this costs no unbounded memory.
 * docs/solutions/android-home-carousel-fling-remounts-every-card.md
 */
const DEFAULT_CACHE_POLICY: ImageProps['cachePolicy'] = 'memory-disk';

export function Image(props: ComponentProps<typeof StyledImage>) {
  return (
    <StyledImage cachePolicy={DEFAULT_CACHE_POLICY} transition={DEFAULT_TRANSITION} {...props} />
  );
}

/**
 * Warm the image cache for a batch of URIs (expo-image's disk/memory cache on
 * native, the browser's on web). Resolves once every image has loaded, or as
 * soon as one fails — callers only wait on it, never read the result.
 */
export const prefetchImages = (uris: string[]): Promise<boolean> => ExpoImage.prefetch(uris);
