import { LegendList, type LegendListProps } from '@legendapp/list/react-native';
import type { ReactElement } from 'react';

export type ListProps<T> = LegendListProps<T>;

/**
 * Web variant: Legend List forwards ScrollView props onto a DOM element, so
 * native-only keyboard props must be stripped here or React warns about
 * unknown DOM attributes. Keyboard behavior is a native concern anyway —
 * callers keep passing these props and native picks them up via index.tsx.
 */
export function List<T>({
  keyboardShouldPersistTaps,
  keyboardDismissMode,
  ...props
}: ListProps<T>): ReactElement {
  void keyboardShouldPersistTaps;
  void keyboardDismissMode;
  return <LegendList {...props} />;
}
