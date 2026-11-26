import { QueryClient } from '@tanstack/react-query';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { createRefreshDeps, refreshNotifications } from '@/features/notifications/refresh';

// expo-task-manager requires defineTask at module-evaluation time for headless background launches; imported for side effects from app/_layout.tsx.
export const NOTIFICATIONS_BACKGROUND_TASK = 'shinobu-notifications-refresh';

const MINIMUM_INTERVAL_MINUTES = 720;

// Headless background launches have no React tree, so this uses its own QueryClient.
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
  const isRegistered = await TaskManager.isTaskRegisteredAsync(NOTIFICATIONS_BACKGROUND_TASK);
  if (isRegistered) return;
  // Restricted on iOS simulators and when Background App Refresh is off,
  // where registering only logs a warning.
  const status = await BackgroundTask.getStatusAsync();
  if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return;
  await BackgroundTask.registerTaskAsync(NOTIFICATIONS_BACKGROUND_TASK, {
    minimumInterval: MINIMUM_INTERVAL_MINUTES,
  });
}

export async function unregisterNotificationsBackgroundTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(NOTIFICATIONS_BACKGROUND_TASK);
  if (!isRegistered) return;
  await BackgroundTask.unregisterTaskAsync(NOTIFICATIONS_BACKGROUND_TASK);
}
