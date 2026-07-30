import * as Burnt from 'burnt';

import { haptics } from '@/lib/haptics';

import { toastPresentation } from './options';

/**
 * The only allowed import of `burnt` (oxlint-enforced, the same wrapper rule
 * as `@legendapp/list`, `torph/react` and `cnfast`). One implementation across
 * web, iOS and Android — never a hand-maintained `.web.ts` sibling; that is
 * the axis burnt was chosen on over `sonner-native` (plan 0032 R6/KTD-2).
 *
 * The haptic fires *here*, once, via the app's own vocabulary (R10):
 * `@/lib/haptics` no-ops on web and covers Android, where burnt's `haptic`
 * option (iOS SPIndicator) does nothing. Call sites must not add their own
 * `haptics.success()`/`.error()` next to a toast — that is the double-fire
 * R10 removed.
 *
 * Web renders through sonner and needs `ToastHost` mounted in `app/_layout`
 * (`@/components/toast-host`). Native renders without a host — but `burnt`
 * ships native code, so adding/upgrading it needs a clean rebuild (KTD-5).
 */
export const toast = {
  /** The committed action succeeded — ephemeral, no recourse needed (R7). */
  success(title: string, message?: string): void {
    haptics.success();
    Burnt.toast(toastPresentation('success', title, message));
  },
  /**
   * The committed action failed *and the recourse lives elsewhere*. Nothing
   * that needs a tap may live in a toast (R7: burnt has no press handler), so
   * any failure carrying a `providerItemUrl` link belongs on the sheet that
   * stays open, not here.
   */
  error(title: string, message?: string): void {
    haptics.error();
    Burnt.toast(toastPresentation('error', title, message));
  },
};
