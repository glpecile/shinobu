import { Image as ExpoImage, type ImageProps } from 'expo-image';
import { useState, type ComponentProps } from 'react';
import { withUniwind } from '@/lib/with-uniwind';
import { useLetterboxdPosterQuery } from '@/state/queries/letterboxd';

import { DURATION } from '@/lib/motion';

/** Uniwind silently drops `className` on unwrapped third-party components on native. */
const StyledImage = withUniwind(ExpoImage);

const DEFAULT_TRANSITION: ImageProps['transition'] = {
  duration: DURATION.swap,
  effect: 'cross-dissolve',
};

/**
 * On Android, expo-image's `disk` default sets Glide's `skipMemoryCache(true)`
 * and re-decodes from disk on every remount
 * (docs/solutions/android-home-carousel-fling-remounts-every-card.md).
 */
const DEFAULT_CACHE_POLICY: ImageProps['cachePolicy'] = 'memory-disk';

const LETTERBOXD_POSTER_PREFIX = 'https://a.ltrbxd.com/resized/film-poster/';

type ImageComponentProps = ComponentProps<typeof StyledImage>;

function uriOf(source: ImageComponentProps['source']): string | undefined {
  return typeof source === 'string'
    ? source
    : source != null && typeof source === 'object' && 'uri' in source
      ? source.uri
      : undefined;
}

export function Image(props: ImageComponentProps) {
  return uriOf(props.source)?.startsWith(LETTERBOXD_POSTER_PREFIX) === true ? (
    <LetterboxdPosterImage {...props} />
  ) : (
    <StyledImage cachePolicy={DEFAULT_CACHE_POLICY} transition={DEFAULT_TRANSITION} {...props} />
  );
}

function LetterboxdPosterImage(props: ImageComponentProps) {
  const { source, onError } = props;
  const uri = uriOf(source);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const { data: poster } = useLetterboxdPosterQuery(uri ?? null, failedUri === uri);
  return (
    <StyledImage
      cachePolicy={DEFAULT_CACHE_POLICY}
      transition={DEFAULT_TRANSITION}
      {...props}
      source={
        poster != null ? (typeof source === 'object' ? { ...source, uri: poster } : poster) : source
      }
      onError={(event) => {
        setFailedUri(uri ?? null);
        onError?.(event);
      }}
    />
  );
}

export const prefetchImages = (uris: string[]): Promise<boolean> => ExpoImage.prefetch(uris);
