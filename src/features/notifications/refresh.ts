import type { QueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';

import type { UpNextInputs } from '@/features/up-next/types';
import { getMutedNotificationKinds, getNotificationsEnabled } from '@/state/prefs/notifications';
import { prefsStorage } from '@/state/prefs/storage';
import { upNextOptions } from '@/state/queries/up-next';

import { computeNotificationSchedule, type NotificationKind } from './compute-schedule';
import { replaceScheduledNotifications } from './scheduler';
import type { ScheduleResult } from './scheduler/types';

const THROTTLE_MS = 15 * 60_000;
const LAST_REFRESH_KEY = 'notifications.lastForegroundRefresh';

export interface RefreshNotificationsDeps {
  isEnabled: () => boolean;
  mutedKinds: () => ReadonlySet<NotificationKind>;
  isWeb: () => boolean;
  gatherInputs: () => Promise<UpNextInputs>;
  schedule: (candidates: ReturnType<typeof computeNotificationSchedule>) => Promise<ScheduleResult>;
  now: () => Date;
  throttle: {
    isThrottled: (nowMs: number) => boolean;
    record: (nowMs: number) => void;
  };
}

export interface RefreshOptions {
  throttle?: boolean;
}

export async function refreshNotifications(
  deps: RefreshNotificationsDeps,
  options: RefreshOptions = {},
): Promise<void> {
  if (deps.isWeb()) return;
  if (!deps.isEnabled()) return;

  const applyThrottle = options.throttle ?? true;
  const nowMs = deps.now().getTime();
  if (applyThrottle) {
    if (deps.throttle.isThrottled(nowMs)) return;
    deps.throttle.record(nowMs);
  }

  const inputs = await deps.gatherInputs();
  if (!deps.isEnabled()) return;
  const candidates = computeNotificationSchedule(inputs, deps.now(), deps.mutedKinds());
  if (inputs.errors.length > 0 && candidates.length === 0) return;
  await deps.schedule(candidates);
}

export function createRefreshDeps(queryClient: QueryClient): RefreshNotificationsDeps {
  return {
    isEnabled: getNotificationsEnabled,
    mutedKinds: getMutedNotificationKinds,
    isWeb: () => Platform.OS === 'web',
    gatherInputs: () => queryClient.fetchQuery(upNextOptions(queryClient)),
    schedule: replaceScheduledNotifications,
    now: () => new Date(),
    throttle: {
      isThrottled: (nowMs) => {
        const last = prefsStorage.getString(LAST_REFRESH_KEY);
        if (last == null) return false;
        return nowMs - Number(last) < THROTTLE_MS;
      },
      record: (nowMs) => prefsStorage.set(LAST_REFRESH_KEY, String(nowMs)),
    },
  };
}
