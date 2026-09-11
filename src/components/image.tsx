import { Image as ExpoImage, type ImageProps } from 'expo-image';
import type { ComponentProps } from 'react';
import { withUniwind } from 'uniwind';

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
 * Artwork crossfades in instead of snapping from an empty box to a full
 * poster, which is the same hard cut the feed's skeletons used to make. It is
 * the one *default* here rather than a per-call-site prop because every image
 * in the app arrives over the network: a poster is either cached (expo-image
 * paints it immediately and the fade never runs) or it is late, and a late one
 * should land like everything else on the screen does.
 *
 * `DURATION.swap` — the same beat a resolved `SuspenseSection` uses, so a row
 * of posters filling in reads as one event with the section that carries them.
 */
const DEFAULT_TRANSITION: ImageProps['transition'] = {
  duration: DURATION.swap,
  effect: 'cross-dissolve',
};

export function Image(props: ComponentProps<typeof StyledImage>) {
  return <StyledImage transition={DEFAULT_TRANSITION} {...props} />;
}

/**
 * Warm the image cache for a batch of URIs (expo-image's disk/memory cache on
 * native, the browser's on web). Resolves once every image has loaded, or as
 * soon as one fails — callers only wait on it, never read the result.
 */
export const prefetchImages = (uris: string[]): Promise<boolean> => ExpoImage.prefetch(uris);
