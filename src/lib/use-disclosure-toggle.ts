import { LayoutAnimation } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { DISCLOSURE_LAYOUT } from '@/lib/motion';

/** Schedule the native disclosure reflow in the press that changes its state. */
export function useDisclosureToggle(onToggle: () => void) {
  const reduceMotion = useReducedMotion();
  return () => {
    if (!reduceMotion) LayoutAnimation.configureNext(DISCLOSURE_LAYOUT);
    onToggle();
  };
}
