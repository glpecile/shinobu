/**
 * The app's toast vocabulary (plan 0032 U1, KTD-2): components say "this
 * succeeded" / "this failed" — they never say "show a `done` preset from the
 * top for 2 seconds". The mapping from verb to `burnt` presentation lives
 * here, pure and renderer-free, so it is the one place presentation truth can
 * drift and the one place a test has to look.
 *
 * Deliberately no import from `burnt`: this module is consumed by the
 * effectful wrapper (`index.ts`, which owns the native module) and by tests
 * that must run under plain `bun test` where burnt's native binding does not
 * exist.
 */

export type ToastKind = 'success' | 'error';

export interface ToastPresentation {
  title: string;
  message?: string;
  preset: 'done' | 'error';
  /** Seconds — burnt's unit, not milliseconds. */
  duration: number;
  /**
   * Always `'none'`: the app's haptic fires from the wrapper via
   * `@/lib/haptics` (R10), which covers Android too — burnt's own `haptic`
   * option is iOS-only, so delegating to it would silently drop the Android
   * buzz the call sites used to fire.
   */
  haptic: 'none';
}

/** Errors linger longer: "Failed on Letterboxd" earns a beat more reading time. */
const DURATION_SECONDS: Record<ToastKind, number> = {
  success: 2,
  error: 3.5,
};

export function toastPresentation(
  kind: ToastKind,
  title: string,
  message?: string,
): ToastPresentation {
  return {
    title,
    ...(message != null && message !== '' ? { message } : {}),
    preset: kind === 'success' ? 'done' : 'error',
    duration: DURATION_SECONDS[kind],
    haptic: 'none',
  };
}
