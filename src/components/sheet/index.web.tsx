import { type ReactNode, useEffect, useState } from 'react';
import { Modal, ScrollView, useWindowDimensions, View } from 'react-native';
import {
  FadeIn,
  FadeOut,
  Keyframe,
  useReducedMotion,
} from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { PresstableOpacity } from '@/components/presstable';
import {
  DURATION,
  EASE_OUT,
  KEYFRAME_EASE_EXIT,
  KEYFRAME_EASE_OUT,
} from '@/lib/motion';

import { sheetScrollMetrics } from './metrics';

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
 * Mirrors the native sheet's detent cap: the panel grows with its content up
 * to this share of the viewport, then the scroller inside it takes over.
 */
const MAX_SHEET_FRACTION = 0.9;

/** The panel's 1px top + bottom border, which `height` (border-box) includes. */
const PANEL_BORDER = 2;

/**
 * The panel, sized from its content and **animating between sizes**. The
 * native sheet animates its `'content'` detent whenever the content's height
 * changes (`animateContentHeight`); a bottom-anchored Modal just snaps. So the
 * panel gets an explicit height driven by the scroller's content size, with a
 * CSS transition on it — the tag picker's "Show more", a result line
 * appearing, and the catch-up chain's ledger (plan 0037) all resize the sheet
 * smoothly instead of jumping. The first measurement goes from `auto` to a
 * pixel value, which CSS doesn't transition, so opening never animates a
 * resize; only later changes do.
 *
 * Same sizing rule as native (`sheetScrollMetrics`): hug the content up to the
 * cap, scroll past it. `max-h` stays as the guard for the one unmeasured frame.
 */
function SheetPanel({
  children,
  reduceMotion,
}: {
  children: ReactNode;
  reduceMotion: boolean;
}) {
  const maxHeight = Math.round(
    useWindowDimensions().height * MAX_SHEET_FRACTION,
  );
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const { height } = sheetScrollMetrics(
    contentHeight == null ? null : contentHeight + PANEL_BORDER,
    maxHeight,
  );

  return (
    <AnimatedView
      className="w-full max-w-xl self-center max-h-[90%] bg-surface border border-border rounded-t-3xl overflow-hidden"
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
        onContentSizeChange={(_width, contentSize) =>
          setContentHeight(Math.ceil(contentSize))
        }
      >
        {children}
      </ScrollView>
    </AnimatedView>
  );
}

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
              className="absolute inset-0 bg-black/60"
              entering={backdropEntering}
              exiting={backdropExiting}
            />
            {/* The rise/fade rides on a full-height wrapper, not the panel.
                Reanimated's web cleanup pins a custom-Keyframe element to
                its snapshot rect as `position: absolute; top: …`
                (docs/solutions/reanimated-web-keyframe-pins-position.md);
                pinning the *panel* froze its top edge, so a panel that grew
                later — the catch-up ledger, a result line — grew downward
                off-screen. Pinning this wrapper changes nothing: it already
                fills the overlay, and `justify-end` keeps the panel bottom-
                anchored however tall it gets. The wrapper covers the scrim,
                and a `box-none` style doesn't survive the animated view on
                web, so the close target is the spacer above the panel, not
                the scrim itself. */}
            <AnimatedView
              className="flex-1 justify-end"
              entering={
                reduceMotion ? FadeIn.duration(DURATION.enter) : panelEntering
              }
              exiting={reduceMotion ? FadeOut.duration(EXIT_MS) : panelExiting}
            >
              <PresstableOpacity
                accessibilityLabel="Close"
                className="flex-1"
                onPress={onClose}
              />
              <SheetPanel reduceMotion={reduceMotion}>{children}</SheetPanel>
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
