import { LegendList, type LegendListProps, type LegendListRef } from '@legendapp/list/react-native';
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
 * Legend List's web scroller renders a raw `<div>` (not RNW's ScrollView), so
 * native-only scroll/keyboard props leak as unknown DOM attributes unless
 * stripped (docs/solutions/web-list-strips-native-scroll-props.md), and
 * vertical lists need explicit flex sizing to avoid mounting at height 0.
 */
export function List<T>({
  keyboardShouldPersistTaps: _keyboardShouldPersistTaps,
  keyboardDismissMode: _keyboardDismissMode,
  nestedScrollEnabled: _nestedScrollEnabled,
  scrollEnabled,
  recycleItems = false,
  onStartReachedThreshold = 0,
  itemLayoutAnimation,
  sharedValues: _sharedValues,
  style,
  ...props
}: ListProps<T>): ReactElement {
  const focused = useIsFocused();
  const ListComponent = itemLayoutAnimation == null ? LegendList : AnimatedLegendList;
  return (
    <Activity mode={focused ? 'visible' : 'hidden'}>
      <ListComponent
        {...props}
        style={
          props.horizontal || scrollEnabled === false
            ? style
            : [{ flexGrow: 1, flexShrink: 1 }, style]
        }
        {...(itemLayoutAnimation != null ? { itemLayoutAnimation } : {})}
        onStartReachedThreshold={onStartReachedThreshold}
        recycleItems={recycleItems}
      />
    </Activity>
  );
}
