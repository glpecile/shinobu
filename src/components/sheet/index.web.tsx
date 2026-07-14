import type { ReactNode } from 'react';
import { Modal, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';

/** Mirrors index.tsx — keep both platform variants' props identical. */
export interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Web fallback: the native sheet lib has no web build, so a bottom-anchored
 * RN Modal stands in — same controlled `open`/`onClose` contract, capped at
 * a readable width on desktop viewports.
 */
export function Sheet({ open, onClose, children }: SheetProps) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={open}
    >
      <View className="flex-1 justify-end">
        <PresstableOpacity
          accessibilityLabel="Close"
          className="absolute inset-0 bg-black/60"
          onPress={onClose}
        />
        <View className="w-full max-w-xl self-center bg-surface border border-border rounded-t-3xl p-6 pb-12">
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** Web needs no portal host — pass-through. */
export function SheetProvider({ children }: { children: ReactNode }) {
  return children;
}
