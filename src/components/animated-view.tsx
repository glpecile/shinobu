import {
  cloneElement,
  isValidElement,
  type ComponentProps,
  type ReactNode,
  type Ref,
  useState,
} from 'react';
import { TextInput } from 'react-native';
import {
  ScrollView as GestureHandlerScrollView,
  type NativeGesture,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedRef, useScrollOffset } from 'react-native-reanimated';

import { PullScrollContext } from '@/components/refresh-control/pull-scroll';
import { withUniwind } from '@/lib/with-uniwind';

/**
 * Reanimated's Animated.View with uniwind className support — className on a
 * raw third-party component is silently dropped on native
 * (docs/solutions/uniwind-classname-third-party-components.md).
 */
export const AnimatedView = withUniwind(Animated.View);

export const AnimatedText = withUniwind(Animated.Text);

export const AnimatedScrollView = withUniwind(Animated.ScrollView);

/**
 * A scroll surface whose rows are pressables. Pressables are
 * gesture-handler buttons, and only gesture-handler's ScrollView cancels them
 * when a drag becomes a scroll; inside React Native's own, a finger that stops
 * a fling or starts a scroll lifts as a press
 * (docs/solutions/ghost-taps-while-scrolling.md).
 */
export function GestureScrollView(props: GestureScrollViewProps) {
  if (props.refreshControl == null || process.env.EXPO_OS === 'web')
    return <ScrollView {...props} />;
  return <PullScrollView {...props} />;
}

const ScrollView = withUniwind(Animated.createAnimatedComponent(GestureHandlerScrollView));
type GestureScrollViewProps = ComponentProps<typeof ScrollView>;

/** Android has no top overscroll, so the refresh control wraps and moves the scroll content. */
const PullScrollView = withUniwind(function PullScrollView({
  ref,
  overScrollMode = 'never',
  refreshControl,
  className: _className,
  contentContainerClassName: _contentContainerClassName,
  style,
  ...props
}: GestureScrollViewProps) {
  const scrollRef = useAnimatedRef();
  const offset = useScrollOffset(scrollRef);
  const [scrollGesture, setScrollGesture] = useState<NativeGesture | null>(null);
  const android = process.env.EXPO_OS === 'android';
  const scroll = (
    <ScrollView
      {...props}
      overScrollMode={overScrollMode}
      refreshControl={android ? undefined : refreshControl}
      style={android ? { flex: 1 } : style}
      onGestureUpdate_CAN_CAUSE_INFINITE_RERENDER={
        android
          ? (gesture) => {
              setScrollGesture((current) =>
                current?.handlerTag === gesture.handlerTag ? current : gesture,
              );
            }
          : undefined
      }
      ref={(node: Parameters<typeof scrollRef>[0]) => {
        scrollRef(node);
        assignRef(ref as Ref<typeof node> | undefined, node);
      }}
    />
  );
  return (
    <PullScrollContext value={{ offset, scrollRef, scrollGesture }}>
      {android &&
      isValidElement<{
        style?: ComponentProps<typeof AnimatedView>['style'];
        children?: ReactNode;
      }>(refreshControl)
        ? cloneElement(refreshControl, { style }, scroll)
        : scroll}
    </PullScrollContext>
  );
});

function assignRef<T>(ref: Ref<T> | undefined, node: T) {
  if (typeof ref === 'function') ref(node);
  else if (ref != null) ref.current = node;
}

export const AnimatedTextInput = withUniwind(Animated.createAnimatedComponent(TextInput));
