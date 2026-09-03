import { haptics } from '@/lib/haptics';

import { sonnerToast } from './sonner';

/** Errors linger longer: "Failed on Letterboxd" earns a beat more reading time.
 *  Milliseconds — sonner's unit (burnt used seconds). */
const DURATION_MS = { success: 2000, error: 3500 } as const;

function toastOptions(kind: keyof typeof DURATION_MS, message?: string) {
  return {
    ...(message != null && message !== '' ? { description: message } : {}),
    duration: DURATION_MS[kind],
  };
}

/**
 * The only allowed import of the toast library (oxlint-enforced, the same
 * wrapper rule as `@legendapp/list`, `torph/react` and `cn`). One call
 * surface across web, iOS and Android: sonner-native renders native, web
 * sonner renders web — the split lives in `./sonner`, never at a call site
 * (owner decision 2026-08-03, replacing burnt: its Android leg was an
 * unstyleable system `ToastAndroid` that dropped the message line entirely).
 *
 * Both platforms need `ToastHost` mounted in `app/_layout`
 * (`@/components/toast-host`) — without its `<Toaster />` the calls silently
 * no-op. sonner-native ships native peer deps (react-native-svg), so
 * adding/upgrading needs a clean rebuild.
 *
 * The haptic fires *here*, once, via the app's own vocabulary (R10):
 * `@/lib/haptics` no-ops on web and covers Android. Call sites must not add
 * their own `haptics.success()`/`.error()` next to a toast — that is the
 * double-fire R10 removed.
 */
export const toast = {
  /** The committed action succeeded — ephemeral, no recourse needed (R7). */
  success(title: string, message?: string): void {
    haptics.success();
    sonnerToast.success(title, toastOptions('success', message));
  },
  /**
   * The committed action failed *and the recourse lives elsewhere*. Toasts
   * stay announcement-only (R7: no press handlers or action buttons — the
   * library offers them; we deliberately never pass one), so any failure
   * carrying a `providerItemUrl` link belongs on the sheet that stays open,
   * not here.
   */
  error(title: string, message?: string): void {
    haptics.error();
    sonnerToast.error(title, toastOptions('error', message));
  },
};
