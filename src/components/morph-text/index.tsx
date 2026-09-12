import { Text } from 'react-native';

/** Mirrors index.web.tsx — keep both platform variants' props identical. */
export interface MorphTextProps {
  /** The current text — a change morphs on web, swaps on native. */
  children: string | number;
  className?: string;
  /** Line cap, as on `Text`; web truncates on one line only (see the web variant). */
  numberOfLines?: number;
}

/**
 * Native fallback: torph is DOM-only, so a text change here is a plain swap.
 * The morph animation is a web-only enhancement, not part of the contract.
 */
export function MorphText({ children, className, numberOfLines }: MorphTextProps) {
  return (
    <Text className={className} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}
