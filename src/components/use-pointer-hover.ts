import { useState } from 'react';
import type { PointerEvent } from 'react-native';

/**
 * Web hover for a card that reveals chrome. Spread `hoverProps` on a wrapper that
 * does not move. Pass `key` when a recycled cell must drop hover on a new item.
 */
export function usePointerHover(key: string | true = true) {
  const [hoveredKey, setHoveredKey] = useState<string | true | null>(null);
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
