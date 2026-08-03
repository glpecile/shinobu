/**
 * The app's toast vocabulary (plan 0032 U1): components say "this succeeded" /
 * "this failed" — they never say "show a success toast at the bottom for 2
 * seconds". The mapping from verb to sonner presentation lives here, pure and
 * renderer-free, so it is the one place presentation truth can drift and the
 * one place a test has to look.
 *
 * Deliberately no import from `sonner-native`/`sonner`: this module is
 * consumed by the effectful wrapper (`index.ts`, which owns the library
 * binding) and by tests that must run under plain `bun test` where the
 * native binding does not exist.
 *
 * No haptic field on purpose: the app's haptic fires from the wrapper via
 * `@/lib/haptics` (R10), never delegated to the toast library.
 */

export type ToastKind = 'success' | 'error';

export interface ToastPresentation {
  title: string;
  /** The second argument to sonner's `toast.success`/`toast.error`. */
  options: {
    description?: string;
    /** Milliseconds — sonner's unit (burnt used seconds; converted here). */
    duration: number;
  };
}

/** Errors linger longer: "Failed on Letterboxd" earns a beat more reading time. */
const DURATION_MS: Record<ToastKind, number> = {
  success: 2000,
  error: 3500,
};

export function toastPresentation(
  kind: ToastKind,
  title: string,
  message?: string,
): ToastPresentation {
  return {
    title,
    options: {
      ...(message != null && message !== '' ? { description: message } : {}),
      duration: DURATION_MS[kind],
    },
  };
}
