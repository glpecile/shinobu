import { Galeria } from '@nandorojo/galeria';
import type { ComponentProps } from 'react';

import { Image } from '@/components/image';
import type { LightboxImage } from '@/components/lightbox/types';
import { PosterPlaceholder } from '@/components/poster-placeholder';

type ZoomableImageProps = ComponentProps<typeof Image> & {
  /** Full-resolution URL for the zoomed viewer; falls back to `uri`. */
  zoomUri?: string;
  /** The displayed (thumbnail) image URL. */
  uri: string;
  /** Web-only viewer shape hint (see index.web.tsx); native uses galeria. */
  type?: LightboxImage['type'];
  /** Accessibility label; consumed by the web viewer, ignored here. */
  alt?: string;
};

/**
 * Native: the one place @nandorojo/galeria is imported (no-restricted-imports
 * in .oxlintrc.json, same wrap-once rule as components/image). Tapping the
 * image opens galeria's native shared-element zoom viewer. An empty `uri`
 * renders the 忍 placeholder tile (nothing to zoom into).
 *
 * Web takes a different path entirely — a decoupled lightbox provider, since
 * galeria's web build morphed the thumbnail into the fullscreen image and
 * ballooned into a giant circle on unzoom (see index.web.tsx). `type`/`alt`
 * exist for that path and are inert here.
 *
 * Native module — adding/upgrading galeria needs a clean rebuild
 * (`bun ios.clean` / `bun android.clean`), and it pins iOS ≥ 16.4
 * (app.json expo-build-properties).
 */
export function ZoomableImage({
  uri,
  zoomUri,
  type: _type,
  alt: _alt,
  ...imageProps
}: ZoomableImageProps) {
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
