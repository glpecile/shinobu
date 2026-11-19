import { useSyncExternalStore } from 'react';
import { Dimensions, type ScaledSize } from 'react-native';

// The web prerender has no window, so it renders every screen at 0 × 0.
const SERVER_WINDOW: ScaledSize = { width: 0, height: 0, scale: 1, fontScale: 1 };

function subscribe(onChange: () => void): () => void {
  const subscription = Dimensions.addEventListener('change', onChange);
  return () => subscription.remove();
}

/**
 * The window size, like React Native's `useWindowDimensions`. On web,
 * hydration reads the prerender's 0 × 0 and the next commit reads the real
 * window. A first render at the real width would branch away from the static
 * HTML and throw React's hydration error #418
 * (docs/solutions/web-hydration-error-418.md).
 */
export function useWindowDimensions(): ScaledSize {
  return useSyncExternalStore(subscribe, () => Dimensions.get('window'), () => SERVER_WINDOW);
}
