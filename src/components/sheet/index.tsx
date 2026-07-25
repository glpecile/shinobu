import {
  BottomSheetProvider,
  ModalBottomSheet,
} from '@swmansion/react-native-bottom-sheet';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { KeyboardAvoidingView } from '@/components/keyboard-avoiding-view';

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

/**
 * The sheet lib does no keyboard handling of its own, so on Android the soft
 * keyboard covered the log sheet's tags and watched-at fields outright (plan
 * 0024 U11 / R8). Padding the content by the keyboard height grows the
 * `'content'` detent, which lifts the fields clear.
 *
 * Android only, deliberately: iOS's sheet host already moves with the keyboard,
 * and adding a second compensation there would over-shoot. `KeyboardProvider`
 * is mounted in `app/_layout.tsx`; this is the mandated wrapper
 * (react-native-keyboard-controller), never RN's core `KeyboardAvoidingView`.
 */
function SheetContent({ children }: { children: ReactNode }) {
  if (process.env.EXPO_OS !== 'android') {
    return <View className="p-6 pb-12">{children}</View>;
  }
  return (
    <KeyboardAvoidingView behavior="padding">
      <View className="p-6 pb-12">{children}</View>
    </KeyboardAvoidingView>
  );
}

/** Mounted once in app/_layout.tsx — hosts the modal sheets' portal. */
export function SheetProvider({ children }: { children: ReactNode }) {
  return <BottomSheetProvider>{children}</BottomSheetProvider>;
}
