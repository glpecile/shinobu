import { createContext, use } from 'react';
import type { NativeGesture } from 'react-native-gesture-handler';
import type { AnimatedRef, SharedValue } from 'react-native-reanimated';

type PullScroll = {
  offset: SharedValue<number>;
  scrollRef: AnimatedRef;
  scrollGesture: NativeGesture | null;
};

export const PullScrollContext = createContext<PullScroll | null>(null);

export function usePullScroll(): PullScroll {
  const scroll = use(PullScrollContext);
  if (scroll == null) throw new Error('RefreshControl must be the refreshControl of a GestureScrollView or List.');
  return scroll;
}
