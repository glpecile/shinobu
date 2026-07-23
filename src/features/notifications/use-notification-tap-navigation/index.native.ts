import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import { routes } from '@/lib/routes';

/**
 * Tap-through navigation (plan 0020 U7, R10, KTD-6). `useLastNotificationResponse`
 * covers all three app states in one hook — cold start (resolves the last
 * response once it's known), background, and foreground taps — so a single
 * effect handles the whole matrix. Clearing the response after navigating is
 * the double-navigation guard: a re-render can't re-fire on the same tap.
 */
export function useNotificationTapNavigation(): void {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (response == null) return;
    const itemId = response.notification.request.content.data?.itemId;
    if (typeof itemId !== 'string' || itemId === '') return;

    Notifications.clearLastNotificationResponse();
    router.push(routes.details(itemId));
  }, [response, router]);
}
