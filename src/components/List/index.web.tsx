import { LegendList, type LegendListProps } from '@legendapp/list/react-native';
import type { ReactElement } from 'react';

export type ListProps<T> = LegendListProps<T>;

/**
 * Web variant: Legend List forwards unrecognized ScrollView props onto a DOM
 * element, so native-only keyboard props must be stripped here or React warns
 * about unknown DOM attributes. Keyboard behavior is a native concern anyway —
 * callers keep passing these props and native picks them up via index.tsx.
 *
 * Verified 2026-07-26 (docs/solutions/web-list-strips-keyboard-persist-taps.md):
 * `keyboardShouldPersistTaps` looks like it should be forwarded, because
 * react-native-web's ScrollView *does* implement it (it blurs the focused
 * TextInput on any touch it claims when the prop is absent). But Legend List's
 * web build ships its own `ListComponentScrollView` over a raw `<div>` and
 * never renders RNW's ScrollView, so the prop has no consumer here — forwarding
 * it only leaks `keyboardshouldpersisttaps` onto that div and logs a React
 * warning on every mount. Don't "fix" this again without re-checking which
 * scroller Legend List actually renders on web.
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
