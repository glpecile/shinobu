import { css } from 'react-native-reanimated';

/**
 * No blur on native: iOS `filter` on a list container re-rasterizes the scroll
 * view every frame (docs/solutions/season-switch-jank-remount-and-blur-on-native.md).
 */
export const wallEntering = css.keyframes({
  from: { transform: [{ translateY: 8 }] },
  to: { transform: [{ translateY: 0 }] },
});
