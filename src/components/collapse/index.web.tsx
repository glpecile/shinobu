import { type ReactNode, useState } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { DURATION, EASE_IN_OUT } from '@/lib/motion';

/** Height-transitioned disclosure for web, since react-native-web ignores `LayoutAnimation`. */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [fullHeight, setFullHeight] = useState<number | undefined>(open ? undefined : 0);
  const [motion, setMotion] = useState({ open, enabled: false });
  const reduceMotion = useReducedMotion();
  if (motion.open !== open) setMotion({ open, enabled: true });
  if (open && !mounted) setMounted(true);
  if (!mounted) return null;

  return (
    <AnimatedView
      className="overflow-hidden"
      style={{
        height: open ? fullHeight : 0,
        // CSS flips visibility at transition end so closing stays visible while
        // closed bodies leave tab order; cast because RN's ViewStyle lacks visibility.
        ...({
          visibility: open ? 'visible' : 'hidden',
          transitionProperty: ['height', 'visibility'],
        } as ViewStyle),
        transitionDuration: reduceMotion || !motion.enabled ? 0 : DURATION.toggle,
        transitionTimingFunction: EASE_IN_OUT,
      }}
    >
      <View onLayout={(event) => setFullHeight(event.nativeEvent.layout.height)}>
        {children}
      </View>
    </AnimatedView>
  );
}
