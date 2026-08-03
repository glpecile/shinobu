import { haptics } from '@/lib/haptics';

import { toastPresentation } from './options';
import { sonnerToast } from './sonner';

/**
 * The only allowed import of the toast library (oxlint-enforced, the same
 * wrapper rule as `@legendapp/list`, `torph/react` and `cnfast`). One call
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
    const presentation = toastPresentation('success', title, message);
    sonnerToast.success(presentation.title, presentation.options);
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
    const presentation = toastPresentation('error', title, message);
    sonnerToast.error(presentation.title, presentation.options);
  },
};
