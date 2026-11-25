import {
  Component,
  Suspense,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { View } from 'react-native';

import { AnimatedView } from '@/components/animated-view';
import { useHydrated } from '@/lib/hydrated';
import { heldKeyframes, SectionEnter, sectionFading } from '@/components/section-enter';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { toast } from '@/lib/toast';

interface BoundaryProps {
  children: ReactNode;
  resetKey?: unknown;
  errorToast?: { title: string; message?: string };
  errorFallback?: ReactNode;
}

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

/** Matches React's `FALLBACK_THROTTLE_MS` (300ms on React DOM and Fabric). */
const SKELETON_HOLD = 300;

const skeletonEntering = heldKeyframes(sectionFading, SKELETON_HOLD, DURATION.swap);

interface Outgoing {
  since: number | null;
  width?: number;
}

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

function Reveal({
  children,
  outgoing,
  skeleton,
}: {
  children: ReactNode;
  outgoing: RefObject<Outgoing>;
  skeleton: ReactNode;
}) {
  const [from] = useState(() => {
    const { since, width } = outgoing.current;
    if (since == null) return null;
    const shown = Math.min(Math.max((performance.now() - since - SKELETON_HOLD) / DURATION.swap, 0), 1);
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

export function SuspenseSection({
  fallback,
  children,
  resetKey,
  errorToast,
  errorFallback,
  animateFallback = true,
}: BoundaryProps & {
  fallback: ReactNode;
  /** Set false for interactive fallbacks; enabled fallbacks are cloned into the crossfade. */
  animateFallback?: boolean;
}) {
  // Static web export awaits every suspended query, so prerendering a section
  // would fetch its provider at build time, and an outage there fails the
  // build (error boundaries don't run on the server).
  const hydrated = useHydrated();
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
