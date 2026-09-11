import { Component, Suspense, type ReactNode } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { toast } from '@/lib/toast';

interface BoundaryProps {
  children: ReactNode;
  /** Change to re-attempt rendering after a caught error (e.g. on refresh). */
  resetKey?: unknown;
  /**
   * Opt-in failure toast: a section that disappears on error is silent by
   * design on dense surfaces (the home feed degrades row by row), but on a
   * detail screen the vanished section *is* the news — a provider outage
   * looks identical to "this show has no episodes". Pass copy naming what
   * failed and the recourse (pull to refresh). Fires once per caught error;
   * a `resetKey` retry that fails again is a new error and toasts again.
   */
  errorToast?: { title: string; message?: string };
}

/**
 * Sections are optional garnish — when their suspense query rejects the
 * section disappears instead of taking the screen down (there is no app-level
 * error boundary, so an uncaught throw would).
 */
class SectionErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    const { errorToast } = this.props;
    if (errorToast != null) toast.error(errorToast.title, errorToast.message);
  }

  override componentDidUpdate(previous: BoundaryProps) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The travel a resolved section makes as it lands. Tiny on purpose: the
 * skeleton it replaces occupies the same box, so this only has to say
 * *something arrived*, not move anything anywhere. Anything larger and a feed
 * of six sections resolving one by one reads as the page shuffling itself.
 */
const SECTION_RISE = 6;

const sectionEntering = {
  '0%': { opacity: 0, transform: [{ translateY: SECTION_RISE }] },
  '100%': { opacity: 1, transform: [{ translateY: 0 }] },
};

/** Reduced motion keeps the fade (it explains the swap) and drops the travel. */
const sectionFading = {
  '0%': { opacity: 0 },
  '100%': { opacity: 1 },
};

/**
 * The section's arrival. A Reanimated *CSS* animation rather than an
 * `entering=` layout animation: this wrapper has to contribute its height to
 * the scroll view's flow on web, and a layout animation pins the element there
 * (same reason `features/log-media/tag-picker.tsx` and the catch-up sheet use
 * presets instead of custom `Keyframe`s).
 *
 * It plays on mount, which is exactly when the suspended child resolves —
 * content lands as a fade-and-settle instead of the hard cut a skeleton
 * swapping for real content otherwise makes. A section whose query was already
 * cached mounts immediately and plays the same 180ms, so a warm screen and a
 * cold one arrive the same way.
 */
function SectionEnter({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatedView
      style={{
        animationName: reduceMotion ? sectionFading : sectionEntering,
        animationDuration: `${DURATION.swap}ms`,
        animationTimingFunction: EASE_OUT,
        // Holds the 0% frame until the first animated frame paints. Native
        // honours it; Reanimated's web path drops it (computed fill-mode comes
        // back `none`), which is harmless — an animation with no delay starts
        // on its 0% frame there anyway.
        animationFillMode: 'both',
      }}
    >
      {children}
    </AnimatedView>
  );
}

/**
 * Suspense boundary for a self-contained, suspense-query-backed screen
 * section: shows `fallback` (a skeleton) while the query loads, renders
 * nothing if it fails, and retries after a failure when `resetKey` changes.
 */
export function SuspenseSection({
  fallback,
  children,
  resetKey,
  errorToast,
}: BoundaryProps & { fallback: ReactNode }) {
  return (
    <SectionErrorBoundary resetKey={resetKey} errorToast={errorToast}>
      <Suspense fallback={fallback}>
        <SectionEnter>{children}</SectionEnter>
      </Suspense>
    </SectionErrorBoundary>
  );
}
