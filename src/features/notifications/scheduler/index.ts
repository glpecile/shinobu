import type { NotificationCandidate } from '@/features/notifications/compute-schedule';

import type { ScheduleResult } from './types';

export async function replaceScheduledNotifications(
  _candidates: readonly NotificationCandidate[],
): Promise<ScheduleResult> {
  return 'skipped';
}

export async function cancelAllScheduledNotifications(): Promise<void> {}

export async function scheduleTestNotification(_itemId?: string): Promise<void> {}
