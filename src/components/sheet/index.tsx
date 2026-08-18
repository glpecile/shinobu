import {
  BottomSheetProvider,
  ModalBottomSheet,
} from '@swmansion/react-native-bottom-sheet';
import { useState, type ReactNode } from 'react';
import {
  ScrollView,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { useKeyboardState } from 'react-native-keyboard-controller';

import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';

import { sheetScrollMetrics } from './metrics';

export interface SheetProps {
  open: boolean;
  /** Called when the sheet reaches its closed detent (drag, scrim tap, …). */
  onClose: () => void;
  children: ReactNode;
}

/**
 * Native bottom sheet (@swmansion/react-native-bottom-sheet — the sheet host,
 * gestures and snapping run in native code; no web build, hence the
 * `index.web.tsx` Modal fallback). Controlled: detent 0 is closed, detent 1
 * sizes to content. The only allowed import of the lib (oxlint-enforced).
 */
export function Sheet({ open, onClose, children }: SheetProps) {
  return (
    <ModalBottomSheet
      detents={[0, 'content']}
      index={open ? 1 : 0}
      // Fires only when a *user* drag commits a detent change…
      onIndexChange={(index) => {
        if (index === 0) onClose();
      }}
      // …while scrim taps / programmatic moves only settle. Both must sync
      // the controlled `open`, or the sheet fights its own state.
      onSettle={(index) => {
        if (index === 0 && open) onClose();
      }}
      scrimColor="rgba(0, 0, 0, 0.6)"
      surface={
        <View className="absolute inset-0 bg-surface rounded-t-3xl border border-border" />
      }
    >
      <SheetContent>{children}</SheetContent>
    </ModalBottomSheet>
  );
}

/** Padding lives on the scroll content, not the scroller, so the indicator
 * tracks the sheet's edge rather than floating inside the padding. */
const CONTENT_PADDING = 'p-6 pb-12';

/**
 * How much of the window a sheet may occupy before its content starts
 * scrolling. The lib's own `'content'` detent cap is a little higher; staying
 * under it means the scroller appears before the sheet is pinned, never after.
 */
const MAX_SHEET_FRACTION = 0.85;

/** Sub-pixel layout noise must not re-size the sheet. */
const HEIGHT_EPSILON = 1;

/**
 * Sheet content scrolls **only once it has to**.
 *
 * The `'content'` detent is measured natively from this subtree, and a
 * `ScrollView` has no intrinsic height to report — it always answers "as much
 * as you have", so a scroller left to size itself pins *every* sheet to the
 * full detent cap: a two-line sheet opened full-screen. Neither `flexShrink`,
 * `flexGrow: 0` nor `maxHeight` changes that; all three were measured on
 * device and none moved the sheet.
 *
 * So the scroller is always in the tree and is given an **explicit height**:
 * the children's own laid-out height, capped. Short sheets hug (the height is
 * the content's), long ones pin and scroll — which is the case the scroller
 * exists for (the log sheet's tag picker, once a few tags exist, used to render
 * its buttons past the bottom edge with no way to reach them). The measurement
 * stays live inside the scroller — children lay out unbounded along the scroll
 * axis — so content that shrinks again drops back to hugging.
 *
 * **The scroller must not come and go.** Swapping between a scroller and a
 * plain `View` (the previous shape of this) reads as one `if` but is an
 * unmount: every child loses its state each time the sheet crosses the cap. The
 * tag picker measures itself to decide whether to collapse, so it came back
 * expanded, which pushed the sheet back over the cap, which swapped the wrapper
 * again — an infinite loop that eventually killed the app
 * (docs/solutions/sheet-scroller-swap-render-loop.md). Sizing one stable
 * scroller has no such feedback: its height depends on the content, and the
 * content's height doesn't depend on it.
 *
 * `keyboardShouldPersistTaps="handled"`: a tap on Confirm while the tags field
 * is focused would otherwise be swallowed as a keyboard dismissal.
 */
function SheetContent({ children }: { children: ReactNode }) {
  const maxHeight = Math.round(
    useWindowDimensions().height * MAX_SHEET_FRACTION,
  );
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  function measure(event: LayoutChangeEvent) {
    const height = event.nativeEvent.layout.height;
    setContentHeight((current) =>
      current != null && Math.abs(current - height) <= HEIGHT_EPSILON
        ? current
        : height,
    );
  }

  const { height, scrollEnabled } = sheetScrollMetrics(contentHeight, maxHeight);
  // Android edge-to-edge never resizes the window for the soft keyboard, so
  // `maxHeight` still describes the full screen while the keyboard covers the
  // sheet's lower half. A sheet that "fits" therefore kept scrollEnabled=false,
  // which left the KeyboardAwareScrollView unable to bring the focused field —
  // or the confirm buttons — out from behind the keyboard. Scroll must be
  // allowed whenever the keyboard is up, not only past the height cap.
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const body = (
    <View className={CONTENT_PADDING} onLayout={measure}>
      {children}
    </View>
  );

  // Android's soft keyboard covers the sheet outright (plan 0024 U11 / R8), so
  // it gets the keyboard-aware scroller: once the sheet is at the cap its
  // bottom padding gives the focused field somewhere to scroll to. iOS keeps
  // the plain scroller, deliberately — its sheet host already moves with the
  // keyboard, and a second compensation would over-shoot. `EXPO_OS` is inlined
  // at build time, so this branch is constant per platform and never remounts.
  const scroller =
    process.env.EXPO_OS === 'android' ? (
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={scrollEnabled || keyboardVisible}
      >
        {body}
      </KeyboardAwareScrollView>
    ) : (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        scrollEnabled={scrollEnabled}
      >
        {body}
      </ScrollView>
    );

  // The height goes on a plain `View` around the scroller rather than on the
  // scroller itself, because for one frame — before the first measurement —
  // there is no height to give, and a `ScrollView` with none fills whatever it
  // is inside. That one frame is the one the sheet's `'content'` detent
  // latches, so every sheet opened at the cap. An auto-height `View` has
  // nothing to fill: with no definite height above it the scroller's
  // `flexGrow` has no free space to claim and it reports its content.
  return <View style={height == null ? undefined : { height }}>{scroller}</View>;
}

/** Mounted once in app/_layout.tsx — hosts the modal sheets' portal. */
export function SheetProvider({ children }: { children: ReactNode }) {
  return <BottomSheetProvider>{children}</BottomSheetProvider>;
}
