import type { QueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';

import type { UpNextInputs } from '@/features/up-next/types';
import type { ProviderId } from '@/lib/providers/types';
import { getNotificationsEnabled } from '@/state/prefs/notifications';
import { prefsStorage } from '@/state/prefs/storage';
import { fetchUpNextInputs } from '@/state/queries/up-next';
import { connectedProviderIds } from '@/state/session/tokens';

import { computeNotificationSchedule } from './compute-schedule';
import { replaceScheduledNotifications } from './scheduler';
import type { ScheduleResult } from './scheduler/types';

/**
 * The refresh orchestrator (plan 0020 U5): gather (U2) → compute (U3) →
 * schedule (U4), gated by the opt-in toggle and platform, throttled on the
 * foreground path only — the background task already paces itself via
 * WorkManager's `minimumInterval` (R6/R7).
 *
 * Deps are injected so the *decisions* (toggle off, throttle window) are
 * testable without MMKV or native modules; `createRefreshDeps` below is the
 * only production wiring, mirroring the `traktDeps()`/`anilistDeps()`
 * module-level builder pattern (KTD-1).
 */

const THROTTLE_MS = 15 * 60_000;
const LAST_REFRESH_KEY = 'notifications.lastForegroundRefresh';

export interface RefreshNotificationsDeps {
  isEnabled: () => boolean;
  isWeb: () => boolean;
  connectedProviders: () => readonly ProviderId[];
  gatherInputs: (connected: readonly ProviderId[]) => Promise<UpNextInputs>;
  schedule: (
    candidates: ReturnType<typeof computeNotificationSchedule>,
  ) => Promise<ScheduleResult>;
  now: () => Date;
  throttle: {
    isThrottled: (nowMs: number) => boolean;
    record: (nowMs: number) => void;
  };
}

export interface RefreshOptions {
  /** False for the background task path — WorkManager already paces it (R6). */
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

  // A disconnected/broken provider contributes zero inputs plus an error
  // entry (fetchUpNextInputs' own partial-failure contract) — never a
  // rejection, so the other provider's candidates still get scheduled (R4).
  const connected = deps.connectedProviders();
  const inputs = await deps.gatherInputs(connected);
  const candidates = computeNotificationSchedule(inputs, deps.now());
  await deps.schedule(candidates);
}

export function createRefreshDeps(queryClient: QueryClient): RefreshNotificationsDeps {
  return {
    isEnabled: getNotificationsEnabled,
    isWeb: () => Platform.OS === 'web',
    connectedProviders: connectedProviderIds,
    gatherInputs: (connected) => fetchUpNextInputs(queryClient, connected),
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
