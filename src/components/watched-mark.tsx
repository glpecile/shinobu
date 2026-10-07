import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { cn } from '@/lib/cn';
import { DURATION, KEYFRAME_EASE_OUT } from '@/lib/motion';
import { useThemeColor } from '@/lib/theme-color';
import { useWatchedInfo } from '@/state/queries/watched-info';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * The accent eye at a row's edge once a connected tracker records the title
 * as watched — Letterboxd's "seen" glyph, at the diary's dot size; a check
 * here reads as done, not seen. Always
 * mounted at a fixed width and faded by state rather than conditionally
 * rendered: the answer arrives after the row does (a library snapshot
 * resolving), and a mark that pops in reads as a glitch where one that
 * settles in reads as the page catching up. `withTiming` inside the worklet
 * re-targets whenever `watched` flips, which covers the resolve and a recycled
 * row's new item alike with no shared value to own.
 *
 * `poster` floats the badge over artwork's top corner instead of a row edge.
 */
export function WatchedMark({
  item,
  poster = false,
}: {
  item: NormalizedMediaItem;
  poster?: boolean;
}) {
  const accent = useThemeColor('--color-accent');
  const watched = useWatchedInfo(item) != null;
  const style = useAnimatedStyle(() => {
    const timing = { duration: DURATION.swap, easing: KEYFRAME_EASE_OUT };
    return {
      opacity: withTiming(watched ? 1 : 0, timing),
      transform: [{ scale: withTiming(watched ? 1 : 0.8, timing) }],
    };
  }, [watched]);
  return (
    <AnimatedView
      accessibilityLabel="Watched"
      aria-hidden={!watched}
      className={cn(
        'w-4 items-end',
        poster &&
          'absolute top-2 left-2 w-8 h-8 items-center justify-center rounded-full bg-surface/95',
      )}
      style={[style, { pointerEvents: 'none' }]}
    >
      <Ionicons color={accent} name="eye" size={14} />
    </AnimatedView>
  );
}
