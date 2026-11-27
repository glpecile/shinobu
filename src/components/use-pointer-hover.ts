import { useState } from 'react';
import type { PointerEvent } from 'react-native';

const NO_HOVER_PROPS: {
  onPointerMove?: (event: PointerEvent) => void;
  onPointerLeave?: () => void;
} = {};

/**
 * Web hover for a card that reveals chrome. Spread `hoverProps` on a wrapper that
 * does not move. Pass `key` when a recycled cell must drop hover on a new item.
 */
export function usePointerHover(key: string | true = true) {
  const [hoveredKey, setHoveredKey] = useState<string | true | null>(null);
  if (process.env.EXPO_OS !== 'web') {
    return { hovered: false, hoverProps: NO_HOVER_PROPS };
  }
  return {
    hovered: hoveredKey === key,
    hoverProps: {
      onPointerMove: (event: PointerEvent) => {
        if (event.nativeEvent.pointerType === 'mouse') setHoveredKey(key);
      },
      onPointerLeave: () => setHoveredKey(null),
    },
  };
}
