import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { haptics } from '@/lib/haptics';

const REPEAT_DELAY = 400;
const REPEAT_EVERY = 60;

type PressEvent = { nativeEvent?: { type?: string; detail?: number } };

/**
 * Hold-to-repeat for a stepper `Button`: spread the result on it. A press steps
 * at once, then after 400ms every 60ms until release, unmount, or `canStep`
 * turning false. Web keyboard and screen-reader clicks step on activation.
 */
export function useHoldRepeat(step: () => void, canStep: boolean) {
  const [hold, setHold] = useState(0);
  const steppedOnPressIn = useRef(false);
  const tick = useEffectEvent(() => {
    if (canStep) step();
    return canStep;
  });

  useEffect(() => {
    if (hold === 0) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const delay = setTimeout(() => {
      if (!tick()) return;
      interval = setInterval(() => {
        if (!tick()) clearInterval(interval);
      }, REPEAT_EVERY);
    }, REPEAT_DELAY);
    return () => {
      clearTimeout(delay);
      clearInterval(interval);
    };
  }, [hold]);

  function stepOnce() {
    haptics.selection();
    step();
  }

  return {
    onPressIn: (event?: PressEvent) => {
      if (event?.nativeEvent?.type === 'keydown') return;
      steppedOnPressIn.current = true;
      stepOnce();
      setHold((current) => current + 1);
    },
    onPressOut: () => setHold(0),
    onPress: (event?: PressEvent) => {
      if (!steppedOnPressIn.current || event?.nativeEvent?.detail === 0) stepOnce();
      steppedOnPressIn.current = false;
    },
  };
}
