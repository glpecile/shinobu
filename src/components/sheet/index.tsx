import { BottomSheetProvider, ModalBottomSheet } from '@swmansion/react-native-bottom-sheet';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { ScrollView, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { useWindowDimensions } from '@/lib/window-dimensions';
import {
  KeyboardController,
  KeyboardEvents,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import {
  createAnimatedComponent,
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated';

import { RailFadeColor } from '@/components/rail';
import { DURATION } from '@/lib/motion';

import { sheetScrollMetrics } from './metrics';
import { SheetCloseContext } from './context';
import { SheetDismissHeader } from './header';

const SHEET_EXIT_MS = 150;
// The library warns below 10 ms.
const SHEET_REDUCED_MS = 16;

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Focuses the first text field when the sheet opens. Desktop web only. */
  autoFocus?: boolean;
}

export function Sheet({ open, onClose, children }: SheetProps) {
  const reduceMotion = useReducedMotion();
  // Negative while the keyboard is up, tracked per frame on the UI thread. A
  // transform, not `bottom`: Reanimated applies it without a shadow-tree commit
  // and relayout each frame (docs/solutions/sheet-keyboard-lift-commits-every-frame.md).
  const keyboard = useReanimatedKeyboardAnimation();
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: open ? keyboard.height.get() : 0 }],
  }));
  // Only Android applies `settleDuration` before `index`, so a controlled dismissal
  // can use a shorter duration than opening.
  const settleDuration = reduceMotion
    ? SHEET_REDUCED_MS
    : open || process.env.EXPO_OS !== 'android'
      ? DURATION.toggle
      : SHEET_EXIT_MS;
  // Android drag-to-close leaves the keyboard up after `Keyboard.dismiss()`; `KeyboardController.dismiss()` hides it natively.
  function close() {
    void KeyboardController.dismiss();
    onClose();
  }
  return (
    <ModalBottomSheet
      animateContentHeight={!reduceMotion}
      detents={[0, 'content']}
      index={open ? 1 : 0}
      // Keep `windowOverlay` off: reparenting into a window dialog outside the gesture-handler root breaks pressto presses on Android.
      onCloseRequest={close}
      // A drag to the closed detent is the one dismissal that never asks.
      onIndexChange={(index) => {
        if (index === 0) close();
      }}
      scrimColor="rgba(0, 0, 0, 0.6)"
      settleDuration={settleDuration}
      // Move the host above the keyboard, never the content, which crashes Fabric
      // (docs/solutions/bottom-sheet-content-detent-clips-tall-content.md). The lib
      // types `style` as static, but `wrapNativeView` forwards animated styles to it.
      style={lift as unknown as ViewStyle}
      wrapNativeView={createAnimatedComponent}
      surface={<View className="absolute inset-0 bg-surface rounded-t-3xl border border-border" />}
    >
      <SheetContent open={open}>
        <SheetCloseContext.Provider value={close}>
          <RailFadeColor value="--color-surface">{children}</RailFadeColor>
        </SheetCloseContext.Provider>
      </SheetContent>
    </ModalBottomSheet>
  );
}

Sheet.Header = SheetDismissHeader;

const CONTENT_PADDING = 'p-6 pb-12';

const MAX_SHEET_FRACTION = 0.85;

const HEIGHT_EPSILON = 1;

function subscribeKeyboard(onChange: () => void) {
  const subscriptions = (['keyboardWillShow', 'keyboardDidHide'] as const).map((event) =>
    KeyboardEvents.addListener(event, onChange),
  );
  return () => subscriptions.forEach((subscription) => subscription.remove());
}

function subscribeNothing() {
  return () => {};
}

/**
 * Keeps one `ScrollView` mounted with an explicit measured height: a `ScrollView`
 * without an explicit height pins the native `'content'` detent to full cap, and
 * swapping between `ScrollView` and `View` unmounts children into a layout loop
 * (docs/solutions/sheet-scroller-swap-render-loop.md).
 */
function SheetContent({ open, children }: { open: boolean; children: ReactNode }) {
  // Closed sheets stay mounted, so only the open one listens: otherwise a
  // keyboard re-renders and recommits every sheet on the screen.
  const keyboardHeight = useSyncExternalStore(
    open ? subscribeKeyboard : subscribeNothing,
    () => (open && KeyboardController.isVisible() ? KeyboardController.state().height : 0),
  );
  const keyboardVisible = keyboardHeight > 0;
  // The lift moves the sheet without shrinking it, so a tall sheet caps above the keyboard.
  const maxHeight = Math.round(
    (useWindowDimensions().height - keyboardHeight) * MAX_SHEET_FRACTION,
  );
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  function measure(event: LayoutChangeEvent) {
    const height = event.nativeEvent.layout.height;
    setContentHeight((current) =>
      current != null && Math.abs(current - height) <= HEIGHT_EPSILON ? current : height,
    );
  }

  const { height, scrollEnabled } = sheetScrollMetrics(contentHeight, maxHeight);
  const body = (
    <View className={CONTENT_PADDING} onLayout={measure}>
      {children}
    </View>
  );

  // Enable scroll while the keyboard is up; otherwise keep short iOS sheets draggable-to-dismiss.
  const scroller = (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      scrollEnabled={scrollEnabled || keyboardVisible || process.env.EXPO_OS === 'android'}
    >
      {body}
    </ScrollView>
  );

  // Height sits on the wrapper `View` so the unmeasured first frame doesn't let
  // `ScrollView` fill and latch the `'content'` detent at the cap.
  return <View style={height == null ? undefined : { height, flexShrink: 1 }}>{scroller}</View>;
}

export function SheetProvider({ children }: { children: ReactNode }) {
  return <BottomSheetProvider>{children}</BottomSheetProvider>;
}
