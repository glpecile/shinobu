import { Text, View } from 'react-native';

import { Image } from '@/components/image';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/initials';

/**
 * A person's circular headshot, with the initials disc as its fallback — the
 * one treatment used by every surface that shows a face without navigating to
 * it (the Cast/Crew cards, the credit sheet's header, the credit line inside
 * the card-actions sheet). Sizing is the caller's: pass the box classes
 * (`w-20 h-20`) and the initials' type scale, since the same avatar appears at
 * 80px in a sheet header and 40px in a credit line.
 */
export function PersonAvatar({
  name,
  headshot,
  className,
  textClassName,
}: {
  name: string;
  /** '' when the person has no image — renders initials instead. */
  headshot: string;
  className?: string;
  textClassName?: string;
}) {
  if (headshot === '') {
    return (
      <View
        className={cn(
          'rounded-full bg-background border border-border items-center justify-center',
          className,
        )}
      >
        <Text
          className={cn('text-muted font-sans-semibold', textClassName)}
          numberOfLines={1}
        >
          {initials(name)}
        </Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: headshot }}
      className={cn('rounded-full bg-background', className)}
      contentFit="cover"
    />
  );
}
