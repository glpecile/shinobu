import { Galeria } from '@nandorojo/galeria';
import type { ComponentProps } from 'react';

import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';

type ZoomableImageProps = ComponentProps<typeof Image> & {
  /** Full-resolution URL for the zoomed viewer; falls back to `uri`. */
  zoomUri?: string;
  /** The displayed (thumbnail) image URL. */
  uri: string;
};

/**
 * The one place @nandorojo/galeria is imported (no-restricted-imports in
 * .oxlintrc.json, same wrap-once rule as components/image). Tapping the image
 * opens a shared-element zoom viewer; galeria's web build supports exactly
 * this single-image case. An empty `uri` renders the 忍 placeholder tile
 * (nothing to zoom into).
 *
 * Native module — adding/upgrading galeria needs a clean rebuild
 * (`bun ios.clean` / `bun android.clean`), and it pins iOS ≥ 16.4
 * (app.json expo-build-properties).
 */
export function ZoomableImage({ uri, zoomUri, ...imageProps }: ZoomableImageProps) {
  if (uri === '') {
    return <PosterPlaceholder className={imageProps.className} />;
  }
  return (
    <Galeria urls={[zoomUri !== '' && zoomUri != null ? zoomUri : uri]}>
      <Galeria.Image>
        <Image source={{ uri }} {...imageProps} />
      </Galeria.Image>
    </Galeria>
  );
}
