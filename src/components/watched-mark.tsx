import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Text, View } from 'react-native';

import { AnimatedView } from '@/components/animated-view';
import { ProgressRing } from '@/components/progress-ring';
import { cn } from '@/lib/cn';
import { DURATION, KEYFRAME_EASE_OUT } from '@/lib/motion';
import { useThemeColor } from '@/lib/theme-color';
import { useMediaProgress } from '@/state/queries/media-progress';
import type { NormalizedMediaItem } from '@/types/media';

/** Shares details' film-page identity read for slug-only posters, never a title guess. */
export function WatchedMark({ item, poster = false, showProgress = false }: { item: NormalizedMediaItem; poster?: boolean; showProgress?: boolean }) {
  const state = useMediaProgress([item]).progress[0];
  const accent = useThemeColor('--color-accent');
  const watched = state.watched;
  const unit = state.unit === 'chapter' ? 'ch' : state.unit === 'season' ? 'seasons' : 'ep';
  const label = `${state.current}${state.total != null && state.total > 0 ? ` / ${state.total}` : ''} ${unit}`;
  const style = useAnimatedStyle(() => {
    const timing = { duration: DURATION.swap, easing: KEYFRAME_EASE_OUT };
    return {
      opacity: withTiming(watched ? 1 : 0, timing),
      transform: [{ scale: withTiming(watched ? 1 : 0.8, timing) }],
    };
  }, [watched]);
  return (
    <>
    <AnimatedView
      accessibilityLabel={item.type === 'TV' ? 'Series watch history' : 'Watched'}
      aria-hidden={!watched}
      className={cn('w-4 items-end', poster && 'absolute top-2 left-2 w-7 h-7 items-center justify-center rounded-full bg-surface/95')}
      style={[style, { pointerEvents: 'none' }]}
    >
      <Ionicons color={accent} name="eye" size={14} />
    </AnimatedView>
    {showProgress && state.current > 0 && !state.completed && (
      <View className={cn('flex-row items-center gap-1.5', poster && 'absolute bottom-2 left-2 rounded bg-surface/95 p-1.5')} style={{ pointerEvents: 'none' }}>
        {state.total != null && state.total > 0 && <ProgressRing label={label} max={state.total} value={state.current} />}
        <Text className="font-sans text-xs text-foreground">{label}</Text>
      </View>
    )}
    </>
  );
}
