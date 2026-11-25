import { haptics } from '@/lib/haptics';

import { showToast } from './sonner';

/** Errors linger longer: "Failed on Letterboxd" earns a beat more reading time.
 *  Milliseconds — sonner's unit (burnt used seconds). */
const DURATION_MS = { success: 2000, error: 3500 } as const;

/**
 * Mount ToastHost once in the layout. This wrapper also plays the haptic, so call sites only
 * send the toast.
 */
export const toast = {
  /** The committed action succeeded — ephemeral, no recourse needed (R7). */
  success(title: string, message?: string): void {
    haptics.success();
    showToast('success', title, message, DURATION_MS.success);
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
    showToast('error', title, message, DURATION_MS.error);
  },
};
