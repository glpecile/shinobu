import { Component, Suspense, type ReactNode } from 'react';

interface BoundaryProps {
  children: ReactNode;
  /** Change to re-attempt rendering after a caught error (e.g. on refresh). */
  resetKey?: unknown;
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
}: BoundaryProps & { fallback: ReactNode }) {
  return (
    <SectionErrorBoundary resetKey={resetKey}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </SectionErrorBoundary>
  );
}
