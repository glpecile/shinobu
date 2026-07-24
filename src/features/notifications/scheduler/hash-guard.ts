import { prefsStorage } from '@/state/prefs/storage';

/**
 * Idempotency for the notification batch (plan 0020 KTD-3/R7): the scheduler
 * replaces the whole batch rather than diffing individual notifications, so
 * the only thing worth caching is whether the *content* changed at all —
 * skipping a no-op replace is what keeps WorkManager's ~12h runs from
 * cancelling and rescheduling identical alarms every time.
 */

const HASH_KEY = 'notifications.scheduleHash';

export type HashGuardResult = 'skipped' | 'replaced';

/** Compares `hash` against the last stored value, updating storage on a change. */
export function checkAndStoreHash(hash: string): HashGuardResult {
  if (prefsStorage.getString(HASH_KEY) === hash) return 'skipped';
  prefsStorage.set(HASH_KEY, hash);
  return 'replaced';
}

/** Forgets the stored hash, so the next schedule always replaces (disable/cancel-all). */
export function clearStoredHash(): void {
  prefsStorage.remove(HASH_KEY);
}
