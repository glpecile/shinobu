import type { DimensionValue } from 'react-native';

export const STACK_OFFSET = 5;

export function episodeCardRailHeight(fontScale: number, headroom = 0): DimensionValue {
  const height = 152 + Math.max(44, 44 * fontScale) + headroom;
  // Web's card classes use rem; a pixel rail clips them when the root font grows.
  return process.env.EXPO_OS === 'web' ? (`${height / 16}rem` as DimensionValue) : height;
}
