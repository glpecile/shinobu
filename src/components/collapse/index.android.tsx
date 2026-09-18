import { type ReactNode, useState } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { DURATION, EASE_IN_OUT } from '@/lib/motion';

/**
 * The body of a disclosure, opened with a height transition — Android ships
 * `LayoutAnimation` disabled (`enableLayoutAnimationsOnAndroid`), so the
 * caller's `configureNext` is a no-op here. Children mount on first open and
 * stay mounted so closing can animate too.
 */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [fullHeight, setFullHeight] = useState(0);
  const reduceMotion = useReducedMotion();
  if (open && !mounted) setMounted(true);
  if (!mounted) return null;

  return (
    <AnimatedView
      className="overflow-hidden"
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      style={{
        height: open ? fullHeight : 0,
        transitionProperty: 'height',
        transitionDuration: reduceMotion ? 0 : DURATION.toggle,
        transitionTimingFunction: EASE_IN_OUT,
      }}
    >
      <View onLayout={(event) => setFullHeight(event.nativeEvent.layout.height)}>
        {children}
      </View>
    </AnimatedView>
  );
}
