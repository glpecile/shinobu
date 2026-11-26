import { LegendList, type LegendListProps, type LegendListRef } from '@legendapp/list/react-native';
import { AnimatedLegendList, type AnimatedLegendListProps } from '@legendapp/list/reanimated';
import type { ReactElement, Ref } from 'react';
import type { ScrollViewProps } from 'react-native';
import { GestureScrollView } from '@/components/animated-view';

export type ListProps<T> = Omit<LegendListProps<T>, 'refScrollView'> & {
  ref?: Ref<LegendListRef>;
  itemLayoutAnimation?: AnimatedLegendListProps<T>['itemLayoutAnimation'];
  sharedValues?: AnimatedLegendListProps<T>['sharedValues'];
};
export type { LegendListRef } from '@legendapp/list/react-native';

/**
 * Defaults `recycleItems={false}` (Legend List warns when omitted),
 * `onStartReachedThreshold={0}` to avoid Legend List >= 3.3.3 closing the
 * shared edge gate on mount
 * (docs/solutions/legend-list-end-reached-never-fires-after-a-fast-scroll.md),
 * and gesture-handler's ScrollView to prevent ghost taps when stopping a fling
 * (docs/solutions/ghost-taps-while-scrolling.md).
 */
export function List<T>({
  recycleItems = false,
  onStartReachedThreshold = 0,
  renderScrollComponent = renderGestureScrollView,
  itemLayoutAnimation,
  sharedValues,
  ...props
}: ListProps<T>): ReactElement {
  const ListComponent =
    itemLayoutAnimation == null && sharedValues == null ? LegendList : AnimatedLegendList;
  return (
    <ListComponent
      {...props}
      {...(itemLayoutAnimation != null ? { itemLayoutAnimation } : {})}
      {...(sharedValues != null ? { sharedValues } : {})}
      onStartReachedThreshold={onStartReachedThreshold}
      recycleItems={recycleItems}
      renderScrollComponent={renderScrollComponent}
    />
  );
}

function renderGestureScrollView(props: ScrollViewProps) {
  return <GestureScrollView {...props} />;
}
