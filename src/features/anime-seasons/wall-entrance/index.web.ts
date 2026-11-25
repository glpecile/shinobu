import { css } from 'react-native-reanimated';

/**
 * Web-only blur (GPU-composited; native omits it — see `index.ts`). No opacity
 * fade: fading from 0 flashes bare background when the previous wall unmounts
 * (docs/solutions/wall-swap-black-flash-posters-not-decoded.md).
 */
export const wallEntering = css.keyframes({
  from: { filter: [{ blur: 6 }], transform: [{ translateY: 8 }] },
  to: { filter: [{ blur: 0 }], transform: [{ translateY: 0 }] },
});
