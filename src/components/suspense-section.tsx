import {
  Component,
  Suspense,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import { View } from 'react-native';

import { AnimatedView } from '@/components/animated-view';
import { heldKeyframes, SectionEnter, sectionFading } from '@/components/section-enter';
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
  /** What stands in after a failure; nothing by default. */
  errorFallback?: ReactNode;
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
    return this.state.failed ? this.props.errorFallback ?? null : this.props.children;
  }
}

function subscribeNever() {
  return () => {};
}

/**
 * How long a skeleton waits unseen; content that beats it appears at once, so
 * a fast load never flashes one. React reveals a boundary's content no sooner
 * than 300ms after its fallback commits (`FALLBACK_THROTTLE_MS`, React DOM and
 * Fabric alike), so a shorter hold would show the skeleton to loads that had
 * already finished.
 */
const SKELETON_HOLD = 300;

const skeletonEntering = heldKeyframes(sectionFading, SKELETON_HOLD, DURATION.swap);

/** What a section's content learns, as it lands, about the skeleton it replaces. */
interface Outgoing {
  /** When the skeleton's hold began: null if none went up, -Infinity if the server rendered it. */
  since: number | null;
  /** Its width, so the copy fading out over the content covers the same box. */
  width?: number;
}

/** The fallback, held back for `SKELETON_HOLD` and then faded in; one the server rendered is already on screen. */
function SkeletonHold({
  children,
  onHoldStart,
  onWidth,
  served,
}: {
  children: ReactNode;
  onHoldStart: () => void;
  onWidth: (width: number) => void;
  served: boolean;
}) {
  return (
    <AnimatedView
      onCSSAnimationStart={onHoldStart}
      onLayout={(event) => onWidth(event.nativeEvent.layout.width)}
      style={
        served
          ? undefined
          : {
              animationName: skeletonEntering,
              animationDuration: SKELETON_HOLD + DURATION.swap,
              animationTimingFunction: EASE_OUT,
            }
      }
    >
      {children}
    </AnimatedView>
  );
}

/**
 * The content replacing a skeleton. One that never showed leaves no trace and
 * the content appears at once. One that showed is pinned over the content
 * where it stood and fades out from the opacity it had reached, as the
 * content fades in under it.
 */
function Reveal({
  children,
  outgoing,
  skeleton,
}: {
  children: ReactNode;
  outgoing: RefObject<Outgoing>;
  skeleton: ReactNode;
}) {
  // Read once, as the content first lands; later renders keep how it arrived.
  const [from] = useState(() => {
    const { since, width } = outgoing.current;
    if (since == null) return null;
    const shown = Math.min(Math.max((performance.now() - since - SKELETON_HOLD) / DURATION.swap, 0), 1);
    // Approximate EASE_OUT's easeOutQuint curve during a partial fade.
    const opacity = 1 - (1 - shown) ** 5;
    return opacity > 0 ? { opacity, width } : null;
  });
  const [leaving, setLeaving] = useState(from != null);

  return (
    <View>
      {from == null ? children : <SectionEnter>{children}</SectionEnter>}
      {from != null && leaving && (
        <AnimatedView
          aria-hidden
          className="absolute inset-x-0 top-0"
          importantForAccessibility="no-hide-descendants"
          onCSSAnimationEnd={() => setLeaving(false)}
          style={{
            pointerEvents: 'none',
            width: from.width,
            // Stay invisible if the animation finishes before its end event arrives.
            opacity: 0,
            animationName: { '0%': { opacity: from.opacity }, '100%': { opacity: 0 } },
            animationDuration: DURATION.swap * from.opacity,
            animationTimingFunction: EASE_OUT,
          }}
        >
          {skeleton}
        </AnimatedView>
      )}
    </View>
  );
}

/**
 * Suspense boundary for a self-contained, suspense-query-backed screen
 * section: shows `fallback` (a skeleton) while the query loads, renders
 * `errorFallback` (nothing by default) if it fails, and retries after a
 * failure when `resetKey` changes.
 *
 * The skeleton waits `SKELETON_HOLD` before it shows, so a fast or cached load
 * never flashes one, and content arriving over a shown skeleton crossfades
 * with it in place.
 */
export function SuspenseSection({
  fallback,
  children,
  resetKey,
  errorToast,
  errorFallback,
  animateFallback = true,
}: BoundaryProps & {
  fallback: ReactNode;
  /** Real controls must stay visible and must never be cloned into the crossfade. */
  animateFallback?: boolean;
}) {
  // Static web export awaits every suspended query, so prerendering a section
  // would fetch its provider at build time, and an outage there fails the
  // build (error boundaries don't run on the server). The server snapshot also
  // covers hydration, so the client renders the same skeleton first.
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  // A prerendered skeleton has been on screen since the page loaded, so
  // holding it back would blank it.
  const [served] = useState(() => !hydrated);
  const outgoing = useRef<Outgoing>({ since: served ? -Infinity : null });
  if (!hydrated) return fallback;
  return (
    <SectionErrorBoundary errorFallback={errorFallback} resetKey={resetKey} errorToast={errorToast}>
      <Suspense
        fallback={
          animateFallback ? (
            <SkeletonHold
              onHoldStart={() => {
                outgoing.current.since = performance.now();
              }}
              onWidth={(width) => {
                outgoing.current.width = width;
              }}
              served={served}
            >
              {fallback}
            </SkeletonHold>
          ) : fallback
        }
      >
        {animateFallback ? (
          <Reveal outgoing={outgoing} skeleton={fallback}>
            {children}
          </Reveal>
        ) : children}
      </Suspense>
    </SectionErrorBoundary>
  );
}
