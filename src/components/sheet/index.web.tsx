import { type ReactNode, useEffect, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import {
  FadeIn,
  FadeOut,
  Keyframe,
  useReducedMotion,
} from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { PresstableOpacity } from '@/components/presstable';
import { DURATION, KEYFRAME_EASE_EXIT, KEYFRAME_EASE_OUT } from '@/lib/motion';

/** Mirrors index.tsx — keep both platform variants' props identical. */
export interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** Exit motion runs this long before the Modal unmounts — keep in sync below. */
const EXIT_MS = DURATION.exit;

/**
 * How far the panel rises into place. Reanimated's `SlideInDown` preset
 * translates from the *window* height, so a bottom-anchored sheet travelled the
 * whole viewport to move a few hundred px of visible distance — the panel spent
 * most of the animation offscreen and the tail read as sluggish no matter how
 * short the duration. A short, fixed nudge plus opacity says "this rose into
 * place" in a fraction of the travel.
 */
const PANEL_RISE = 28;
/** The exit nudge is smaller: a hint of direction, not a re-run of the enter. */
const PANEL_FALL = 16;

/**
 * Module scope, per Reanimated's animation-builder performance rule (same as
 * `components/lightbox/index.web.tsx`) — rebuilding these per render allocates
 * a new builder on every commit.
 */
const panelEntering = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: PANEL_RISE }] },
  100: {
    opacity: 1,
    transform: [{ translateY: 0 }],
    easing: KEYFRAME_EASE_OUT,
  },
}).duration(DURATION.enter);

const panelExiting = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }] },
  100: {
    opacity: 0,
    transform: [{ translateY: PANEL_FALL }],
    easing: KEYFRAME_EASE_EXIT,
  },
}).duration(EXIT_MS);

/**
 * The backdrop is a *paired* element: it shares the panel's duration and curve
 * exactly, so the two read as one surface arriving. (They used to run 200ms vs
 * 300ms, which is why the sheet looked like it lagged behind its own scrim.)
 * Opacity only, so it needs no reduced-motion variant.
 */
const backdropEntering = new Keyframe({
  0: { opacity: 0 },
  100: { opacity: 1, easing: KEYFRAME_EASE_OUT },
}).duration(DURATION.enter);

const backdropExiting = new Keyframe({
  0: { opacity: 1 },
  100: { opacity: 0, easing: KEYFRAME_EASE_EXIT },
}).duration(EXIT_MS);

/**
 * Web fallback: the native sheet lib has no web build, so a bottom-anchored
 * RN Modal stands in — same controlled `open`/`onClose` contract, capped at a
 * readable width on desktop viewports.
 *
 * RN Modal's own `animationType` cross-fades the whole modal (backdrop + sheet
 * together materialise in place), which reads as a flicker rather than a sheet
 * appearing. Instead we drive motion with Reanimated: backdrop and panel fade
 * in together on one strong ease-out while the panel rises a short distance,
 * and both leave on a faster ease-in-shaped curve. Timing, not springs —
 * springs don't run on web. The Modal is held mounted for `EXIT_MS` after
 * `open` flips false so the exit actually plays before unmount.
 */
export function Sheet({ open, onClose, children }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const reduceMotion = useReducedMotion();

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
              entering={backdropEntering}
              exiting={backdropExiting}
            >
              <PresstableOpacity
                accessibilityLabel="Close"
                className="flex-1 bg-black/60"
                onPress={onClose}
              />
            </AnimatedView>
            <AnimatedView
              // Mirrors the native sheet's detent cap: the panel grows with its
              // content up to 90% of the viewport, then the scroller inside it
              // takes over. Without the cap a tall sheet (the log sheet's tag
              // picker) ran off the top of the window with nothing to scroll.
              className="w-full max-w-xl self-center max-h-[90%] bg-surface border border-border rounded-t-3xl"
              // Reduced motion keeps the fade (it explains that a layer
              // arrived) and drops the travel, matching the lightbox.
              entering={
                reduceMotion ? FadeIn.duration(DURATION.enter) : panelEntering
              }
              exiting={reduceMotion ? FadeOut.duration(EXIT_MS) : panelExiting}
            >
              <ScrollView
                className="shrink"
                contentContainerClassName="p-6 pb-12"
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>
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
