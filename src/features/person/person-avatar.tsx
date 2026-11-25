import { useState } from 'react';
import { Text, View } from 'react-native';

import { Image } from '@/components/image';
import { Skeleton } from '@/components/skeleton';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/initials';

export function PersonAvatar({
  name,
  headshot,
  className,
  textClassName,
}: {
  name: string;
  headshot: string;
  className?: string;
  textClassName?: string;
}) {
  const [settled, setSettled] = useState<{ uri: string; failed: boolean } | null>(null);
  const status = settled?.uri === headshot ? settled : null;

  if (headshot === '' || status?.failed === true) {
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
    <View className={cn('rounded-full bg-background overflow-hidden', className)}>
      <Skeleton animated={status == null} className="absolute inset-0" />
      <Image
        className="w-full h-full"
        contentFit="cover"
        onError={() => setSettled({ uri: headshot, failed: true })}
        onLoad={() => setSettled({ uri: headshot, failed: false })}
        source={{ uri: headshot }}
      />
    </View>
  );
}
