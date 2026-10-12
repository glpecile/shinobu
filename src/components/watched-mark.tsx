import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { cn } from '@/lib/cn';
import { DURATION, KEYFRAME_EASE_OUT } from '@/lib/motion';
import { useThemeColor } from '@/lib/theme-color';
import { useLetterboxdFilmQuery } from '@/state/queries/letterboxd';
import { useWatchedInfo } from '@/state/queries/watched-info';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

/** Shares details' film-page identity read for slug-only posters, never a title guess. */
export function WatchedMark({ item, poster = false }: { item: NormalizedMediaItem; poster?: boolean }) {
  const connected = useConnectedProviders();
  const canReadWatched = connected.includes('trakt') || connected.includes('simkl');
  const film = useLetterboxdFilmQuery(
    canReadWatched && item.externalIds.tmdb == null && item.externalIds.trakt == null && item.externalIds.simkl == null
      ? item.externalIds.letterboxd ?? null : null,
  );
  const accent = useThemeColor('--color-accent');
  const watched = useWatchedInfo(film.data ?? item) != null;
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
      className={cn('w-4 items-end', poster && 'absolute top-2 left-2 w-8 h-8 items-center justify-center rounded-full bg-surface/95')}
      style={[style, { pointerEvents: 'none' }]}
    >
      <Ionicons color={accent} name="eye" size={14} />
    </AnimatedView>
  );
}
