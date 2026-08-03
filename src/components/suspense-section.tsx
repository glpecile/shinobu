import { Component, Suspense, type ReactNode } from 'react';

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
      <Suspense fallback={fallback}>{children}</Suspense>
    </SectionErrorBoundary>
  );
}
