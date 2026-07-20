import { type ReactNode, useEffect, useState } from 'react';
import { Modal, View } from 'react-native';
import { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { PresstableOpacity } from '@/components/presstable';

/** Mirrors index.tsx — keep both platform variants' props identical. */
export interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** Exit motion runs this long before the Modal unmounts — keep in sync below. */
const EXIT_MS = 240;

/**
 * Web fallback: the native sheet lib has no web build, so a bottom-anchored
 * RN Modal stands in — same controlled `open`/`onClose` contract, capped at a
 * readable width on desktop viewports.
 *
 * RN Modal's own `animationType` cross-fades the whole modal (backdrop + sheet
 * together materialise in place), which reads as a flicker rather than a sheet
 * appearing. Instead we drive motion with Reanimated: the backdrop fades while
 * the sheet slides up from the bottom edge (and reverses on close). The Modal
 * is held mounted for `EXIT_MS` after `open` flips false so the slide-down
 * actually plays before unmount.
 */
export function Sheet({ open, onClose, children }: SheetProps) {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  if (!mounted) return null;

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible>
      <View className="flex-1 justify-end">
        {open && (
          <>
            <AnimatedView
              className="absolute inset-0"
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(EXIT_MS)}
            >
              <PresstableOpacity
                accessibilityLabel="Close"
                className="flex-1 bg-black/60"
                onPress={onClose}
              />
            </AnimatedView>
            <AnimatedView
              className="w-full max-w-xl self-center bg-surface border border-border rounded-t-3xl p-6 pb-12"
              entering={SlideInDown.duration(300)}
              exiting={SlideOutDown.duration(EXIT_MS)}
            >
              {children}
            </AnimatedView>
          </>
        )}
      </View>
    </Modal>
  );
}

/** Web needs no portal host — pass-through. */
export function SheetProvider({ children }: { children: ReactNode }) {
  return children;
}
