import { css } from 'react-native-reanimated';

/**
 * How a wall arrives on native: a short rise, nothing else. The web variant
 * adds the blur; on iOS a `filter` on the list container is a SwiftUI-backed
 * effect that re-rasterizes the whole scroll view every frame, and stacked on
 * a list mount it dropped most of the entrance's frames
 * (docs/solutions/season-switch-jank-remount-and-blur-on-native.md).
 */
export const wallEntering = css.keyframes({
  from: { transform: [{ translateY: 8 }] },
  to: { transform: [{ translateY: 0 }] },
});
