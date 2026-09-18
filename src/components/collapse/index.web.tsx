import { type ReactNode, useState } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { DURATION, EASE_IN_OUT } from '@/lib/motion';

/**
 * The body of a disclosure, opened with a height transition — react-native-web
 * ignores `LayoutAnimation`, so the native variant's motion never runs here.
 * Children mount on first open and stay mounted so closing can animate too.
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
      style={{
        height: open ? fullHeight : 0,
        // Keeps a closed body's buttons out of the tab order and the
        // accessibility tree. CSS flips `visibility` at the visible end of a
        // transition, so the body stays drawn while it closes. Cast: a
        // react-native-web style key that React Native's `ViewStyle` lacks.
        ...({ visibility: open ? 'visible' : 'hidden' } as ViewStyle),
        ...(reduceMotion
          ? null
          : {
              transitionProperty: ['height', 'visibility'],
              transitionDuration: DURATION.toggle,
              transitionTimingFunction: EASE_IN_OUT,
            }),
      }}
    >
      <View onLayout={(event) => setFullHeight(event.nativeEvent.layout.height)}>
        {children}
      </View>
    </AnimatedView>
  );
}
