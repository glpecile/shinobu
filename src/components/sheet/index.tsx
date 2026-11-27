import { BottomSheetProvider, ModalBottomSheet } from '@swmansion/react-native-bottom-sheet';
import { useState, type ReactNode } from 'react';
import { ScrollView, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { useWindowDimensions } from '@/lib/window-dimensions';
import {
  KeyboardController,
  useKeyboardState,
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

const SHEET_ENTER_MS = DURATION.toggle;
const SHEET_EXIT_MS = 150;
// One frame at 60 Hz; stays at or above the lib's 10 ms seconds-unit dev warning threshold.
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
  // Negative while the keyboard is up, tracked per frame on the UI thread.
  const keyboard = useReanimatedKeyboardAnimation();
  const lift = useAnimatedStyle(() => ({ bottom: open ? -keyboard.height.get() : 0 }));
  // Android applies `settleDuration` before `index` (`onAfterUpdateTransaction`), so close settles
  // faster than open. iOS applies `index` first in `updateProps`, which would invert them.
  const settleDuration = reduceMotion
    ? SHEET_REDUCED_MS
    : open || process.env.EXPO_OS !== 'android'
      ? SHEET_ENTER_MS
      : SHEET_EXIT_MS;
  // Android drag-to-close leaves the keyboard up after `Keyboard.dismiss()`; `KeyboardController.dismiss()` hides it natively.
  function close() {
    void KeyboardController.dismiss();
    onClose();
  }
  return (
    <ModalBottomSheet
      animateContentHeight={!reduceMotion}
      animateIn={!reduceMotion}
      detents={[0, 'content']}
      index={open ? 1 : 0}
      // Unmount while closed so `SheetContent` never starts an open spring from a stale closed height.
      lazy
      // Keep `windowOverlay` off: reparenting into a window dialog outside the gesture-handler root breaks pressto presses on Android.
      onCloseRequest={close}
      // A drag to the closed detent is the one dismissal that never asks.
      onIndexChange={(index) => {
        if (index === 0) close();
      }}
      scrimColor="rgba(0, 0, 0, 0.6)"
      settleDuration={settleDuration}
      // Resize the host above the keyboard, never the content, which crashes Fabric
      // (docs/solutions/bottom-sheet-content-detent-clips-tall-content.md). The lib
      // types `style` as static, but `wrapNativeView` forwards animated styles to it.
      style={lift as unknown as ViewStyle}
      wrapNativeView={createAnimatedComponent}
      surface={<View className="absolute inset-0 bg-surface rounded-t-3xl border border-border" />}
    >
      <SheetContent>
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

/**
 * Keeps one `ScrollView` mounted with an explicit measured height: a `ScrollView`
 * without an explicit height pins the native `'content'` detent to full cap, and
 * swapping between `ScrollView` and `View` unmounts children into a layout loop
 * (docs/solutions/sheet-scroller-swap-render-loop.md).
 */
function SheetContent({ children }: { children: ReactNode }) {
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const maxHeight = Math.round(useWindowDimensions().height * MAX_SHEET_FRACTION);
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

  // Enable scroll when the keyboard shrinks the lifted host; otherwise keep short iOS sheets draggable-to-dismiss.
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
