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

import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';

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

/**
 * Sheet content scrolls **only once it has to**.
 *
 * The `'content'` detent is measured natively from this subtree, and a
 * `ScrollView` has no intrinsic height to report — it always answers "as much
 * as you have". So an unconditional scroller (the first shape of this fix)
 * pinned *every* sheet to the full detent cap: a two-line sheet opened
 * full-screen. Neither `flexShrink`, `flexGrow: 0` nor `maxHeight` changes
 * that; all three were measured on device and none moved the sheet. The
 * scroller has to be absent from the tree for the detent to see real content.
 *
 * So: render the children in a plain `View` and watch its laid-out height. Only
 * when that exceeds the cap does the scroller wrap them — which is exactly the
 * case the scroller existed for (the log sheet's tag picker, once a few tags
 * exist, used to render its buttons past the bottom edge with no way to reach
 * them). The measurement stays live inside the scroller, so content that
 * shrinks again drops back to hugging.
 *
 * `keyboardShouldPersistTaps="handled"` matters more than usual in the scroll
 * branch: a tap on Confirm while the tags field is focused would otherwise be
 * swallowed as a keyboard dismissal.
 */
function SheetContent({ children }: { children: ReactNode }) {
  const maxHeight = Math.round(
    useWindowDimensions().height * MAX_SHEET_FRACTION,
  );
  const [overflows, setOverflows] = useState(false);

  // Measures the children's *natural* height in both branches — inside the
  // scroller they still lay out unbounded — so this settles rather than
  // oscillating between the two.
  function measure(event: LayoutChangeEvent) {
    setOverflows(event.nativeEvent.layout.height > maxHeight);
  }

  const body = (
    <View className={CONTENT_PADDING} onLayout={measure}>
      {children}
    </View>
  );

  if (!overflows) return body;

  // Android's soft keyboard covers the sheet outright (plan 0024 U11 / R8), so
  // it gets the keyboard-aware scroller: once the sheet is at the cap its
  // bottom padding gives the focused field somewhere to scroll to. iOS keeps
  // the plain scroller, deliberately — its sheet host already moves with the
  // keyboard, and a second compensation would over-shoot.
  if (process.env.EXPO_OS === 'android') {
    return (
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        style={{ maxHeight }}
      >
        {body}
      </KeyboardAwareScrollView>
    );
  }
  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight }}>
      {body}
    </ScrollView>
  );
}

/** Mounted once in app/_layout.tsx — hosts the modal sheets' portal. */
export function SheetProvider({ children }: { children: ReactNode }) {
  return <BottomSheetProvider>{children}</BottomSheetProvider>;
}
