import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  registerNotificationsBackgroundTask,
  unregisterNotificationsBackgroundTask,
} from '@/features/notifications/background-task';
import { createRefreshDeps, refreshNotifications } from '@/features/notifications/refresh';
import { useNotificationTapNavigation } from '@/features/notifications/use-notification-tap-navigation';
import { useNotificationsEnabled } from '@/state/prefs/notifications';

// expo-notifications suppresses foreground banners by default unless a handler is registered at module load.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function NotificationsRuntime(): null {
  const queryClient = useQueryClient();
  const enabled = useNotificationsEnabled();
  useNotificationTapNavigation();

  useEffect(() => {
    void refreshNotifications(createRefreshDeps(queryClient));

    const subscription = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') {
          void refreshNotifications(createRefreshDeps(queryClient));
        }
      },
    );
    return () => subscription.remove();
  }, [queryClient]);

  useEffect(() => {
    if (enabled) {
      void registerNotificationsBackgroundTask();
    } else {
      void unregisterNotificationsBackgroundTask();
    }
  }, [enabled]);

  return null;
}
