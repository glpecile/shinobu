import type { NotificationCandidate } from '@/features/notifications/compute-schedule';

import type { ScheduleResult } from './types';

/**
 * Web schedules nothing and pretends nothing (R12) — Up Next is web's
 * equivalent surface. Same signatures as the native module so callers never
 * branch on platform.
 */

export async function replaceScheduledNotifications(
  _candidates: readonly NotificationCandidate[],
): Promise<ScheduleResult> {
  return 'skipped';
}

export async function cancelAllScheduledNotifications(): Promise<void> {}

export async function scheduleTestNotification(_itemId?: string): Promise<void> {}
