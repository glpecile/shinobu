import { css } from 'react-native-reanimated';

/**
 * How a wall arrives on web: resolving out of a blur while it rises. A CSS
 * filter here is GPU-composited and costs nothing, which is exactly what it
 * does *not* do on native — see the sibling `index.ts`.
 *
 * No opacity: the previous wall is already gone when this one mounts, so a
 * fade from 0 paints the bare background for its first frames — a black flash
 * on every switch (docs/solutions/wall-swap-black-flash-posters-not-decoded.md).
 */
export const wallEntering = css.keyframes({
  from: { filter: [{ blur: 6 }], transform: [{ translateY: 8 }] },
  to: { filter: [{ blur: 0 }], transform: [{ translateY: 0 }] },
});
