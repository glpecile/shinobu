import { QueryClient } from '@tanstack/react-query';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { createRefreshDeps, refreshNotifications } from '@/features/notifications/refresh';

/**
 * The Android WorkManager / iOS BGTaskScheduler background refresh (plan
 * 0020 R6, KTD-4). `defineTask` must run at module-evaluation time — even for
 * a headless background launch, no component tree exists yet — so this
 * module is imported for its side effect from `app/_layout.tsx`, never
 * called directly.
 */

export const NOTIFICATIONS_BACKGROUND_TASK = 'shinobu-notifications-refresh';

/** ~12h (R6) — the OS treats this as a minimum, not a schedule. */
const MINIMUM_INTERVAL_MINUTES = 720;

// The React-mounted QueryClient doesn't exist in a headless background
// launch, so the task gets its own — provider reads are cache-through, not
// cache-shared, across the two (KTD-1).
const backgroundQueryClient = new QueryClient();

TaskManager.defineTask(NOTIFICATIONS_BACKGROUND_TASK, async () => {
  try {
    await refreshNotifications(createRefreshDeps(backgroundQueryClient), {
      throttle: false,
    });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerNotificationsBackgroundTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(
    NOTIFICATIONS_BACKGROUND_TASK,
  );
  if (isRegistered) return;
  await BackgroundTask.registerTaskAsync(NOTIFICATIONS_BACKGROUND_TASK, {
    minimumInterval: MINIMUM_INTERVAL_MINUTES,
  });
}

export async function unregisterNotificationsBackgroundTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(
    NOTIFICATIONS_BACKGROUND_TASK,
  );
  if (!isRegistered) return;
  await BackgroundTask.unregisterTaskAsync(NOTIFICATIONS_BACKGROUND_TASK);
}
