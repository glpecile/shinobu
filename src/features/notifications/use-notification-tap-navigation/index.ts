import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import { routes } from '@/lib/routes';

export function useNotificationTapNavigation(): void {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (response == null) return;
    const itemId = response.notification.request.content.data?.itemId;
    const mediaType = response.notification.request.content.data?.mediaType;
    if (typeof itemId !== 'string' || itemId.indexOf('-') < 1) return;

    Notifications.clearLastNotificationResponse();
    // push-guard-exempt: a notification tap, not a press. Tapping the same
    // show's notification again after backing out is a real second intent, and
    // `clearLastNotificationResponse` above is what stops this one repeating.
    router.push(routes.details(itemId, mediaType === 'MOVIE' || mediaType === 'TV' ? mediaType : undefined));
  }, [response, router]);
}
