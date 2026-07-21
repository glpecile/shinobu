import type { ComponentProps } from 'react';

import { Image } from '@/components/image';
import { useLightboxControls } from '@/components/lightbox/state';
import type { LightboxImage } from '@/components/lightbox/types';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PresstableOpacity } from '@/components/presstable';

type ZoomableImageProps = ComponentProps<typeof Image> & {
  /** Full-resolution URL for the zoomed viewer; falls back to `uri`. */
  zoomUri?: string;
  /** The displayed (thumbnail) image URL. */
  uri: string;
  /** Viewer shape: `image` fills the screen, `circle-avi`/`rect-avi` cap it. */
  type?: LightboxImage['type'];
  /** Accessibility label for the trigger and the zoomed image. */
  alt?: string;
};

/**
 * Web: a thin trigger for the global lightbox (components/lightbox). Tapping
 * opens a fullscreen fade/zoom-in viewer via `openLightbox` — deliberately
 * decoupled from this thumbnail so there's no shared-element morph (galeria's
 * web build ballooned into a giant circle on unzoom). Keeps the same props as
 * the native galeria wrapper; an empty `uri` renders the 忍 placeholder.
 */
export function ZoomableImage({
  uri,
  zoomUri,
  type = 'image',
  alt,
  ...imageProps
}: ZoomableImageProps) {
  const { openLightbox } = useLightboxControls();

  if (uri === '') {
    return <PosterPlaceholder className={imageProps.className} />;
  }

  const source = zoomUri !== '' && zoomUri != null ? zoomUri : uri;

  return (
    <PresstableOpacity
      accessibilityLabel={alt ?? 'View image'}
      onPress={() => openLightbox({ images: [{ uri: source, alt, type }] })}
    >
      <Image source={{ uri }} {...imageProps} />
    </PresstableOpacity>
  );
}
