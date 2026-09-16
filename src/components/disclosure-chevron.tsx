import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { DURATION, EASE_IN_OUT } from '@/lib/motion';
import { useThemeColor } from '@/lib/theme-color';

const TURN = { down: '180deg', forward: '90deg' } as const;

/**
 * The muted chevron beside a toggle, turning over as it opens rather than
 * swapping glyphs: one arrow rotating reads as a single reversible thing.
 * `from` is its closed direction — `down` flips up, `forward` turns down.
 */
export function DisclosureChevron({
  open,
  from = 'down',
  size,
  className = '',
}: {
  open: boolean;
  from?: 'down' | 'forward';
  size: number;
  /** Layout only. */
  className?: string;
}) {
  const muted = useThemeColor('--color-muted');
  const reduceMotion = useReducedMotion();
  return (
    <AnimatedView
      className={className}
      style={{
        transform: [{ rotate: open ? TURN[from] : '0deg' }],
        transitionProperty: 'transform',
        transitionDuration: reduceMotion ? 0 : DURATION.toggle,
        transitionTimingFunction: EASE_IN_OUT,
      }}
    >
      <Ionicons
        color={muted}
        name={from === 'down' ? 'chevron-down' : 'chevron-forward'}
        size={size}
      />
    </AnimatedView>
  );
}
