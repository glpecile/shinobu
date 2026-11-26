import { type ReactNode, useEffect, useState } from 'react';
import { Modal, ScrollView, View, type ViewInstance } from 'react-native';
import { useWindowDimensions } from '@/lib/window-dimensions';
import {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  Keyframe,
  useReducedMotion,
} from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { PresstableOpacity } from '@/components/presstable';
import { RailFadeColor } from '@/components/rail';
import { hasCoarsePointer } from '@/lib/pointer';
import { DURATION, EASE_OUT, KEYFRAME_EASE_EXIT, KEYFRAME_EASE_OUT } from '@/lib/motion';

import { sheetScrollMetrics } from './metrics';
import { SheetCloseContext } from './context';
import { SheetDismissHeader } from './header';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Focuses the first text field when the sheet opens. Desktop web only. */
  autoFocus?: boolean;
}

/** Focuses the first field on `animationstart` because React `autoFocus` is dropped on entering web modals (docs/solutions/web-sheet-autofocus-dropped.md). */
function focusFirstFieldOnReveal(view: ViewInstance | null) {
  const overlay = view as unknown as HTMLElement | null;
  if (overlay == null || hasCoarsePointer()) return;

  function stop() {
    overlay?.removeEventListener('animationstart', focusField);
  }
  function focusField() {
    const field = overlay?.querySelector<HTMLElement>('input, textarea');
    if (field == null) return stop();
    field.focus();
    if (document.activeElement === field) stop();
  }

  overlay.addEventListener('animationstart', focusField);
  return stop;
}

const EXIT_MS = DURATION.exit;

/** Presets instead of custom `Keyframe`: Reanimated web pins custom-Keyframe rects, sinking the panel behind mobile keyboards (docs/solutions/reanimated-web-keyframe-pins-position.md). */
const panelEntering = FadeInDown.duration(DURATION.enter).easing(KEYFRAME_EASE_OUT);
const panelExiting = FadeOutDown.duration(EXIT_MS).easing(KEYFRAME_EASE_EXIT);

const backdropEntering = new Keyframe({
  0: { opacity: 0 },
  100: { opacity: 1, easing: KEYFRAME_EASE_OUT },
}).duration(DURATION.enter);

const backdropExiting = new Keyframe({
  0: { opacity: 1 },
  100: { opacity: 0, easing: KEYFRAME_EASE_EXIT },
}).duration(EXIT_MS);

const MAX_SHEET_FRACTION = 0.9;

const PANEL_BORDER = 2;

function SheetPanel({ children, reduceMotion }: { children: ReactNode; reduceMotion: boolean }) {
  const maxHeight = Math.round(useWindowDimensions().height * MAX_SHEET_FRACTION);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const { height } = sheetScrollMetrics(
    contentHeight == null ? null : contentHeight + PANEL_BORDER,
    maxHeight,
  );

  return (
    <AnimatedView
      className="w-full max-w-xl self-center max-h-9/10 bg-surface border border-border rounded-t-3xl overflow-hidden"
      style={{
        height,
        transitionProperty: 'height',
        transitionDuration: reduceMotion ? 0 : DURATION.swap,
        transitionTimingFunction: EASE_OUT,
      }}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-6 pb-12"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={(_width, contentSize) => setContentHeight(Math.ceil(contentSize))}
      >
        <RailFadeColor value="--color-surface">{children}</RailFadeColor>
      </ScrollView>
    </AnimatedView>
  );
}

export function Sheet({ open, onClose, children, autoFocus }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const reduceMotion = useReducedMotion();

  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  if (!mounted) return null;

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible>
      <View
        className="flex-1 justify-end"
        ref={autoFocus && open ? focusFirstFieldOnReveal : undefined}
      >
        {open && (
          <>
            <AnimatedView
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              entering={backdropEntering}
              exiting={backdropExiting}
            />
            {/* `box-none` doesn't survive Reanimated `AnimatedView` on web, so the scrim close target lives inside this wrapper below the panel. */}
            <AnimatedView
              className="flex-1 justify-end"
              entering={reduceMotion ? FadeIn.duration(DURATION.enter) : panelEntering}
              exiting={reduceMotion ? FadeOut.duration(EXIT_MS) : panelExiting}
            >
              <PresstableOpacity
                accessibilityLabel="Close"
                className="absolute inset-0"
                onPress={onClose}
              />
              <SheetCloseContext.Provider value={onClose}>
                <SheetPanel reduceMotion={reduceMotion}>{children}</SheetPanel>
              </SheetCloseContext.Provider>
            </AnimatedView>
          </>
        )}
      </View>
    </Modal>
  );
}

Sheet.Header = SheetDismissHeader;

export function SheetProvider({ children }: { children: ReactNode }) {
  return children;
}
