import Ionicons from '@react-native-vector-icons/ionicons/static';
import {
  FadeIn,
  FadeOut,
  Keyframe,
  useReducedMotion,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { AnimatedView } from '@/components/animated-view';
import { PresstableOpacity } from '@/components/presstable';
import { DURATION, KEYFRAME_EASE_EXIT, KEYFRAME_EASE_OUT } from '@/lib/motion';

/**
 * How far (px) a list must be scrolled before the FAB appears. Under half a
 * screenful: once the first rows are out of sight the top is no longer a
 * single flick away, and waiting longer just makes the button feel absent.
 */
export const SCROLL_TO_TOP_THRESHOLD = 300;

// The FAB toggles mid-scroll, so its entrance has to read as an aside, not an
// event: a small scale-up with a few px of rise says "this surfaced from the
// corner" where a bare crossfade reads as a glitchy repaint. Travel stays tiny
// for the same reason the log sheet's does — it appears many times a session.
const FAB_RISE = 8;

const fabEntering = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.85 }, { translateY: FAB_RISE }] },
  100: {
    opacity: 1,
    transform: [{ scale: 1 }, { translateY: 0 }],
    easing: KEYFRAME_EASE_OUT,
  },
}).duration(DURATION.enter);

const fabExiting = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }] },
  100: {
    opacity: 0,
    transform: [{ scale: 0.85 }, { translateY: FAB_RISE }],
    easing: KEYFRAME_EASE_EXIT,
  },
}).duration(DURATION.exit);

/** Reduced motion keeps the fade and drops the travel (matches `features/up-next`). */
const fabFadingIn = FadeIn.duration(DURATION.enter);
const fabFadingOut = FadeOut.duration(DURATION.exit);

/**
 * A floating "back to top" button for long scrolling screens. The owner tracks
 * its own scroll offset (compare against `SCROLL_TO_TOP_THRESHOLD`) and scrolls
 * its own list — this component only shows, hides, and forwards the press.
 * Render it as a sibling of the list inside a relatively-positioned container.
 */
export function ScrollToTopFab({
  visible,
  onPress,
}: {
  visible: boolean;
  onPress: () => void;
}) {
  const accentForeground = useCSSVariable('--color-accent-foreground');
  const reduceMotion = useReducedMotion();
  if (!visible) return null;
  return (
    <AnimatedView
      className="absolute bottom-6 right-6"
      entering={reduceMotion ? fabFadingIn : fabEntering}
      exiting={reduceMotion ? fabFadingOut : fabExiting}
    >
      <PresstableOpacity
        accessibilityLabel="Scroll to top"
        accessibilityRole="button"
        className="w-11 h-11 rounded-full bg-accent items-center justify-center"
        onPress={onPress}
      >
        <Ionicons
          color={typeof accentForeground === 'string' ? accentForeground : undefined}
          name="arrow-up"
          size={20}
        />
      </PresstableOpacity>
    </AnimatedView>
  );
}
