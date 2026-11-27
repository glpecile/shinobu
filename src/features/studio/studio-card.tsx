import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';

import { Image } from '@/components/image';
import { OverlayActionsButton } from '@/components/overlay-actions-button';
import { PresstableScale } from '@/components/presstable';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { usePointerHover } from '@/components/use-pointer-hover';
import { useThemeColor } from '@/lib/theme-color';
import type { NormalizedStudio } from '@/types/media';

/** Keep the hover actions button a sibling of `PresstableScale`; nested gesture-handler buttons bubble presses. */
export function StudioCard({
  studio,
  onPress,
  onActions,
}: {
  studio: NormalizedStudio;
  onPress: () => void;
  onActions?: () => void;
}) {
  const muted = useThemeColor('--color-muted');
  const { hovered, hoverProps } = usePointerHover();

  return (
    <View
      className="w-32 relative"
      {...hoverProps}
    >
      <PresstableScale
        accessibilityLabel={studio.name}
        accessibilityRole="button"
        onLongPress={onActions}
        onPress={onPress}
      >
        {studio.logo != null ? (
          <View className="h-20 rounded-lg bg-logo-tile p-3">
            <Image className="flex-1" contentFit="contain" source={{ uri: studio.logo }} />
          </View>
        ) : (
          <View className="h-20 rounded-lg bg-surface border border-border items-center justify-center">
            <Ionicons color={muted} name="business-outline" size={24} />
          </View>
        )}
        <Text
          className="text-foreground font-sans-semibold text-xs text-center mt-2"
          numberOfLines={2}
        >
          {studio.name}
        </Text>
      </PresstableScale>
      {process.env.EXPO_OS === 'web' && onActions != null && (
        <OverlayActionsButton
          className="absolute top-1 right-1"
          label={`More options for ${studio.name}`}
          onPress={onActions}
          size="sm"
          visible={hovered}
        />
      )}
    </View>
  );
}

export function StudioCardSkeleton({ index }: { index: number }) {
  return (
    <View className="w-32 items-center">
      <Skeleton className="h-20 w-32 rounded-lg" delay={staggerDelay(index)} />
      <Skeleton className="h-4 w-20 rounded mt-2" delay={staggerDelay(index)} />
    </View>
  );
}
