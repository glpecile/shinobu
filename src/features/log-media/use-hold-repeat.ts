import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { haptics } from '@/lib/haptics';

const REPEAT_DELAY = 400;
const REPEAT_EVERY = 60;

/**
 * Hold-to-repeat for a stepper `Button`: spread the result on it. A press steps
 * at once, then after 400ms every 60ms until release, unmount, or `canStep`
 * turning false. Each tick reads `canStep` itself, because a button disabled
 * mid-press is not promised a press-out. Keyboard and screen-reader activation
 * fire `onPress` alone, so `onPress` steps only when no press-in did.
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
    onPressIn: () => {
      steppedOnPressIn.current = true;
      stepOnce();
      setHold((current) => current + 1);
    },
    onPressOut: () => setHold(0),
    onPress: () => {
      if (steppedOnPressIn.current) steppedOnPressIn.current = false;
      else stepOnce();
    },
  };
}
