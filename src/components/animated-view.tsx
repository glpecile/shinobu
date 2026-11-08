import type { ComponentProps, Ref } from 'react';
import { TextInput } from 'react-native';
import { ScrollView as GestureHandlerScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedRef, useScrollOffset } from 'react-native-reanimated';

import { PullScrollContext } from '@/components/refresh-control/pull-scroll';
import { withUniwind } from '@/lib/with-uniwind';

/**
 * Reanimated's Animated.View with uniwind className support — className on a
 * raw third-party component is silently dropped on native
 * (docs/solutions/uniwind-classname-third-party-components.md).
 */
export const AnimatedView = withUniwind(Animated.View);

/** Same wrapper for text whose colour transitions (a selected-state crossfade). */
export const AnimatedText = withUniwind(Animated.Text);

/** Same wrapper for a scroll view whose offset drives a shared value (a pager). */
export const AnimatedScrollView = withUniwind(Animated.ScrollView);

/**
 * A scroll surface whose rows are pressables. Pressables are
 * gesture-handler buttons, and only gesture-handler's ScrollView cancels them
 * when a drag becomes a scroll; inside React Native's own, a finger that stops
 * a fling or starts a scroll lifts as a press
 * (docs/solutions/ghost-taps-while-scrolling.md).
 */
export function GestureScrollView(props: GestureScrollViewProps) {
  if (props.refreshControl == null || process.env.EXPO_OS === 'web') return <ScrollView {...props} />;
  return <PullScrollView {...props} />;
}

const ScrollView = withUniwind(
  Animated.createAnimatedComponent(GestureHandlerScrollView),
);
type GestureScrollViewProps = ComponentProps<typeof ScrollView>;

/**
 * Hands its `refreshControl` the scroll offset the pull is drawn from. Android
 * has no top overscroll: the refresh control moves the content itself.
 */
function PullScrollView({ ref, overScrollMode = 'never', ...props }: GestureScrollViewProps) {
  const scrollRef = useAnimatedRef();
  const offset = useScrollOffset(scrollRef);
  return (
    <PullScrollContext value={{ offset, scrollRef }}>
      <ScrollView
        {...props}
        overScrollMode={overScrollMode}
        ref={(node: Parameters<typeof scrollRef>[0]) => {
          scrollRef(node);
          assignRef(ref as Ref<typeof node> | undefined, node);
        }}
      />
    </PullScrollContext>
  );
}

function assignRef<T>(ref: Ref<T> | undefined, node: T) {
  if (typeof ref === 'function') ref(node);
  else if (ref != null) ref.current = node;
}

/** Same wrapper for a field whose border transitions on focus. */
export const AnimatedTextInput = withUniwind(
  Animated.createAnimatedComponent(TextInput),
);
