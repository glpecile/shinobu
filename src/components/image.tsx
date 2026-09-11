import { Image as ExpoImage } from 'expo-image';
import { withUniwind } from 'uniwind';

/**
 * The one place expo-image is imported. Uniwind resolves `className` natively
 * only for components wrapped in `withUniwind` — on a raw third-party
 * component the prop is silently dropped on iOS/Android (it only "works" on
 * web because the class name lands in the DOM where real CSS applies), which
 * left every poster sized 0×0 and invisible on native. Enforced by
 * no-restricted-imports in .oxlintrc.json.
 */
export const Image = withUniwind(ExpoImage);

/**
 * Warm the image cache for a batch of URIs (expo-image's disk/memory cache on
 * native, the browser's on web). Resolves once every image has loaded, or as
 * soon as one fails — callers only wait on it, never read the result.
 */
export const prefetchImages = (uris: string[]): Promise<boolean> => ExpoImage.prefetch(uris);
