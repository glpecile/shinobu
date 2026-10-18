import {
  LegendList,
  type LegendListProps,
  type LegendListRef,
} from '@legendapp/list/react-native';
import { AnimatedLegendList, type AnimatedLegendListProps } from '@legendapp/list/reanimated';
import { Activity, type ReactElement, type Ref } from 'react';
import { useIsFocused } from 'expo-router';

export type ListProps<T> = Omit<LegendListProps<T>, 'refScrollView'> & {
  ref?: Ref<LegendListRef>;
  itemLayoutAnimation?: AnimatedLegendListProps<T>['itemLayoutAnimation'];
};
export type { LegendListRef } from '@legendapp/list/react-native';

/**
 * Web variant: Legend List forwards unrecognized ScrollView props onto a DOM
 * element, so keyboard and Android-only nested-scrolling props must be stripped
 * here or React warns about unknown DOM attributes. Callers keep passing these
 * props and native picks them up via index.tsx.
 *
 * See docs/solutions/web-list-strips-native-scroll-props.md:
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
  nestedScrollEnabled,
  scrollEnabled,
  recycleItems = false,
  onStartReachedThreshold = 0,
  itemLayoutAnimation,
  ...props
}: ListProps<T>): ReactElement {
  const focused = useIsFocused();
  void keyboardShouldPersistTaps;
  void keyboardDismissMode;
  void nestedScrollEnabled;
  void scrollEnabled;
  const ListComponent = itemLayoutAnimation == null ? LegendList : AnimatedLegendList;
  // Both defaulted, not omitted — see index.tsx for why.
  return (
    <Activity mode={focused ? 'visible' : 'hidden'}>
      <ListComponent
        {...props}
        {...(itemLayoutAnimation != null ? { itemLayoutAnimation } : {})}
        onStartReachedThreshold={onStartReachedThreshold}
        recycleItems={recycleItems}
      />
    </Activity>
  );
}
