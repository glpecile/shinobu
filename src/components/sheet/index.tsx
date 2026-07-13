import {
  BottomSheetProvider,
  ModalBottomSheet,
} from '@swmansion/react-native-bottom-sheet';
import type { ReactNode } from 'react';
import { View } from 'react-native';

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
      <View className="p-6 pb-12">{children}</View>
    </ModalBottomSheet>
  );
}

/** Mounted once in app/_layout.tsx — hosts the modal sheets' portal. */
export function SheetProvider({ children }: { children: ReactNode }) {
  return <BottomSheetProvider>{children}</BottomSheetProvider>;
}
