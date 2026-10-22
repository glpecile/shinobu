import {
  BottomSheetProvider,
  ModalBottomSheet,
} from '@swmansion/react-native-bottom-sheet';
import { useState, type ReactNode } from 'react';
import {
  Keyboard,
  ScrollView,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';

import { RailFadeColor } from '@/components/rail';

import { sheetScrollMetrics } from './metrics';
import { SheetCloseContext } from './context';
import { SheetDismissHeader } from './header';

export interface SheetProps {
  open: boolean;
  /** Called on Android Back or when the sheet reaches its closed detent. */
  onClose: () => void;
  children: ReactNode;
  /** Focuses the first text field when the sheet opens. Desktop web only. */
  autoFocus?: boolean;
}

/**
 * Native bottom sheet (@swmansion/react-native-bottom-sheet — the sheet host,
 * gestures and snapping run in native code; no web build, hence the
 * `index.web.tsx` Modal fallback). Controlled: detent 0 is closed, detent 1
 * sizes to content. The only allowed import of the lib (oxlint-enforced).
 */
export function Sheet({ open, onClose, children }: SheetProps) {
  const keyboardHeight = useKeyboardState((state) => (state.isVisible ? state.height : 0));
  // A focused field outlives the sheet, which stays mounted while closed, so
  // its keyboard would stay up over the screen beneath.
  function close() {
    Keyboard.dismiss();
    onClose();
  }
  return (
    <ModalBottomSheet
      detents={[0, 'content']}
      index={open ? 1 : 0}
      // `nativeOverlay` stays off: it reparents the sheet into a window-level
      // dialog outside the gesture-handler root, which kills every pressto
      // press inside it on Android (hotfix 0.6.1 — the log sheet went dead).
      // Back on pushed screens can pop behind an open sheet again; that is the
      // cheaper bug until a press-safe overlay exists.
      onCloseRequest={close}
      // Fires only when a *user* drag commits a detent change…
      onIndexChange={(index) => {
        if (index === 0) close();
      }}
      // …while scrim taps / programmatic moves only settle. Both must sync
      // the controlled `open`, or the sheet fights its own state.
      onSettle={(index) => {
        if (index === 0 && open) close();
      }}
      scrimColor="rgba(0, 0, 0, 0.6)"
      // Android's keyboard draws over the sheet, which is short enough that
      // its scroller has nowhere to scroll a field to. Shrinking the host lifts
      // the sheet above the keyboard, like `adjustResize`; the host re-anchors
      // on resize natively. Resize the host, never the content, which crashed
      // Fabric (docs/solutions/bottom-sheet-content-detent-clips-tall-content.md).
      style={process.env.EXPO_OS === 'android' && open ? { bottom: keyboardHeight } : undefined}
      surface={
        <View className="absolute inset-0 bg-surface rounded-t-3xl border border-border" />
      }
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
  const body = (
    <View className={CONTENT_PADDING} onLayout={measure}>
      {children}
    </View>
  );

  // No keyboard-aware scroller: the sheet host itself moves above the keyboard
  // (see `Sheet`), so scrolling the field up as well would over-shoot.
  const scroller = (
    <ScrollView keyboardShouldPersistTaps="handled" scrollEnabled={scrollEnabled}>
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
