import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Image } from '@/components/image';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { ProviderIcon, type IconSourceId } from '@/components/provider-icon';

/** Short fade behind the marks — enough to read them on bright artwork,
 *  shallow enough not to read as a caption bar. */
const MARK_SCRIM_HEIGHT = 34;

/**
 * A poster's artwork with brand marks bottom-right, on a surface pill so they
 * read on any art. Goes inside the caller's pressable, which owns the frame and
 * the accessibility label (the marks are decoration to a screen reader).
 * `caption` replaces the marks' scrim with its own taller one.
 */
export function PosterFace({
  uri,
  recyclingKey,
  marks,
  caption,
}: {
  uri: string;
  recyclingKey?: string;
  marks: readonly IconSourceId[];
  caption?: ReactNode;
}) {
  return (
    <>
      {uri !== '' ? (
        <Image
          source={{ uri }}
          className="w-full h-full"
          contentFit="cover"
          recyclingKey={recyclingKey}
        />
      ) : (
        <PosterPlaceholder className="w-full h-full border-0" />
      )}
      {caption ?? (
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.72)']}
          style={{ bottom: 0, height: MARK_SCRIM_HEIGHT, left: 0, position: 'absolute', right: 0 }}
        />
      )}
      {/* A catalogue wall (the seasons explorer) has no provenance to show. */}
      {marks.length > 0 && (
        <View className="absolute bottom-1.5 right-1.5 flex-row gap-1 p-1 rounded-full bg-surface/95 border border-border/40">
          {marks.map((id) => (
            <ProviderIcon id={id} key={id} size={12} />
          ))}
        </View>
      )}
    </>
  );
}
