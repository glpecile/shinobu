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
  sharedValues?: AnimatedLegendListProps<T>['sharedValues'];
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
 *
 * That scroller is also a bare block `<div>`, so a vertical list would size to
 * its rows or mount at height 0. It gets RN `ScrollView`'s default flex unless
 * it's horizontal or `scrollEnabled={false}`, where it should fit its rows.
 */
export function List<T>({
  keyboardShouldPersistTaps,
  keyboardDismissMode,
  nestedScrollEnabled,
  scrollEnabled,
  recycleItems = false,
  onStartReachedThreshold = 0,
  itemLayoutAnimation,
  sharedValues,
  style,
  ...props
}: ListProps<T>): ReactElement {
  const focused = useIsFocused();
  void keyboardShouldPersistTaps;
  void keyboardDismissMode;
  void nestedScrollEnabled;
  void scrollEnabled;
  void sharedValues;
  const ListComponent = itemLayoutAnimation == null ? LegendList : AnimatedLegendList;
  // Both defaulted, not omitted — see index.tsx for why.
  return (
    <Activity mode={focused ? 'visible' : 'hidden'}>
      <ListComponent
        {...props}
        style={props.horizontal || scrollEnabled === false ? style : [{ flexGrow: 1, flexShrink: 1 }, style]}
        {...(itemLayoutAnimation != null ? { itemLayoutAnimation } : {})}
        onStartReachedThreshold={onStartReachedThreshold}
        recycleItems={recycleItems}
      />
    </Activity>
  );
}
