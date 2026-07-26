import {
  BottomSheetProvider,
  ModalBottomSheet,
} from '@swmansion/react-native-bottom-sheet';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

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
 * Sheet content scrolls. The `'content'` detent is clamped natively to the
 * detent cap (sheet height minus the status-bar overlap), and the lib lays the
 * children out at their full natural height inside that cap — so anything
 * taller than the screen was simply cut off with no way to reach it (the log
 * sheet's tag picker, once a few tags exist).
 *
 * `shrink` is the whole fix, and it needs no measured heights: the lib's own
 * content wrapper is a `flex: 1` child of a node padded down to the cap, so a
 * shrinkable scroller inside it sizes to its content while it fits and clamps
 * to the cap when it doesn't. Short sheets still size to content exactly as
 * before. Nested-scrollable gesture negotiation is automatic in the lib — the
 * drag-to-dismiss handoff needs no wiring here.
 *
 * `keyboardShouldPersistTaps="handled"` matters more than usual now: with a
 * scroller in the tree, a tap on Confirm while the tags field is focused would
 * otherwise be swallowed as a keyboard dismissal.
 */
function SheetContent({ children }: { children: ReactNode }) {
  // Android's soft keyboard covers the sheet outright (plan 0024 U11 / R8), so
  // it gets the keyboard-aware scroller: its bottom padding grows the
  // `'content'` detent to lift a short sheet clear, and once the sheet is at
  // the cap the same padding gives the focused field somewhere to scroll to.
  // iOS keeps the plain scroller, deliberately — its sheet host already moves
  // with the keyboard, and a second compensation would over-shoot.
  if (process.env.EXPO_OS === 'android') {
    return (
      <KeyboardAwareScrollView
        bottomOffset={24}
        className="shrink"
        contentContainerClassName={CONTENT_PADDING}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </KeyboardAwareScrollView>
    );
  }
  return (
    <ScrollView
      className="shrink"
      contentContainerClassName={CONTENT_PADDING}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/** Mounted once in app/_layout.tsx — hosts the modal sheets' portal. */
export function SheetProvider({ children }: { children: ReactNode }) {
  return <BottomSheetProvider>{children}</BottomSheetProvider>;
}
