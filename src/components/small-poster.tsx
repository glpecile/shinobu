import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { cn } from '@/lib/cn';

const SIZE = {
  sm: 'w-9 h-13.5 rounded',
  md: 'w-12 h-18 rounded',
  lg: 'w-14 h-21 rounded',
};

/** Artwork only; callers own provider recovery and any metadata fallback. */
export function SmallPoster({ uri, recyclingKey, size }: {
  uri: string;
  recyclingKey: string;
  size: keyof typeof SIZE;
}) {
  if (uri === '') return <PosterPlaceholder className={SIZE[size]} />;
  return (
    <Image
      source={{ uri }}
      className={cn(SIZE[size], 'bg-surface border border-border/50')}
      contentFit="cover"
      recyclingKey={recyclingKey}
    />
  );
}
