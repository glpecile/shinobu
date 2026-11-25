import { Galeria } from '@nandorojo/galeria';
import type { ComponentProps } from 'react';

import { Image } from '@/components/image';
import type { LightboxImage } from '@/components/lightbox/types';
import { PosterPlaceholder } from '@/components/poster-placeholder';

type ZoomableImageProps = ComponentProps<typeof Image> & {
  zoomUri?: string;
  uri: string;
  type?: LightboxImage['type'];
  alt?: string;
};

/** `@nandorojo/galeria` pins iOS ≥ 16.4 (`app.json` `expo-build-properties`). */
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
