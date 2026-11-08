import { createContext, use } from 'react';
import type { NativeGesture } from 'react-native-gesture-handler';
import type { AnimatedRef, SharedValue } from 'react-native-reanimated';

type PullScroll = {
  /** The scroll view's vertical offset; negative while iOS overscrolls the top. */
  offset: SharedValue<number>;
  scrollRef: AnimatedRef;
  scrollGesture: NativeGesture | null;
};

/**
 * Provided by `GestureScrollView` to the `refreshControl` it renders, which
 * draws the pull from the scroll position.
 */
export const PullScrollContext = createContext<PullScroll | null>(null);

export function usePullScroll(): PullScroll {
  const scroll = use(PullScrollContext);
  if (scroll == null) throw new Error('RefreshControl must be the refreshControl of a GestureScrollView or List.');
  return scroll;
}
