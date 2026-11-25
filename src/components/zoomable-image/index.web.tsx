import type { ComponentProps } from 'react';

import { Image } from '@/components/image';
import { useLightboxControls } from '@/components/lightbox/state';
import type { LightboxImage } from '@/components/lightbox/types';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PresstableOpacity } from '@/components/presstable';

type ZoomableImageProps = ComponentProps<typeof Image> & {
  zoomUri?: string;
  uri: string;
  type?: LightboxImage['type'];
  alt?: string;
};

/** Uses the decoupled lightbox on web because `@nandorojo/galeria`'s web build morphs into a giant circle on unzoom. */
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
