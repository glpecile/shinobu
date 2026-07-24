import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { useNotificationsEnabled } from '@/state/prefs/notifications';

import {
  registerNotificationsBackgroundTask,
  unregisterNotificationsBackgroundTask,
} from './background-task';
import { createRefreshDeps, refreshNotifications } from './refresh';

// Module-eval side effect (this file is imported eagerly from
// `app/_layout.tsx`, same as `background-task`'s `defineTask`): without a
// handler, expo-notifications' default policy is to NOT display a banner
// while the app is foregrounded — every scheduled notification (including
// the settings screen's "Send test notification", which fires ~5s later
// while the app is still open) was silently swallowed instead of shown.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Mounted once at the app root (plan 0020 U5): refreshes the scheduled
 * notification batch on cold start and every foreground transition
 * (throttled inside `refreshNotifications`, R5), and keeps the background
 * task registration in sync with the opt-in toggle (R6, R8). Renders
 * nothing — same "hidden side-effect component" shape as
 * `LetterboxdWriteBridge`.
 */
export function NotificationsRuntime(): null {
  const queryClient = useQueryClient();
  const enabled = useNotificationsEnabled();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    void refreshNotifications(createRefreshDeps(queryClient));

    // refreshNotifications reads the toggle live on every call (R8), so this
    // subscription is set up once per app lifetime rather than re-bound on
    // every toggle flip.
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
    if (Platform.OS === 'web') return;
    if (enabled) {
      void registerNotificationsBackgroundTask();
    } else {
      void unregisterNotificationsBackgroundTask();
    }
  }, [enabled]);

  return null;
}
