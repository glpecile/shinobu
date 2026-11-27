import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { cn } from '@/lib/cn';

const SLOTS = 5;
const POSTER_WIDTH = 32;
const STEP = (100 - POSTER_WIDTH) / (SLOTS - 1);
export const POSTER_STACK_RATIO = 100 / (POSTER_WIDTH * 1.5);

export function PosterStack({
  previews,
  className,
  children,
}: {
  previews: readonly { id: string; coverImage: string }[];
  className?: string;
  children?: ReactNode;
}) {
  return (
    <View className={cn('w-full', className)} style={{ aspectRatio: POSTER_STACK_RATIO }}>
      {Array.from({ length: SLOTS }, (_, index) => {
        const film = previews[index];
        return (
          <View
            className={cn(
              'absolute inset-y-0 rounded-md overflow-hidden border border-hairline',
              film == null ? 'bg-surface/60' : 'bg-surface shadow-md',
            )}
            key={film == null ? `empty-${index}` : `${film.id}/${index}`}
            style={{ left: `${index * STEP}%`, width: `${POSTER_WIDTH}%`, zIndex: SLOTS - index }}
          >
            {film != null &&
              (film.coverImage === '' ? (
                <PosterPlaceholder className="w-full h-full border-0" />
              ) : (
                <Image
                  className="w-full h-full"
                  contentFit="cover"
                  recyclingKey={film.id}
                  source={{ uri: film.coverImage }}
                />
              ))}
          </View>
        );
      })}
      {children != null && (
        <View
          className="absolute inset-0 items-center justify-center"
          style={{ zIndex: SLOTS + 1 }}
        >
          {children}
        </View>
      )}
    </View>
  );
}
