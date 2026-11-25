import { prefsStorage } from '@/state/prefs/storage';

const HASH_KEY = 'notifications.scheduleHash';

export type HashGuardResult = 'skipped' | 'replaced';

export function checkAndStoreHash(hash: string): HashGuardResult {
  if (prefsStorage.getString(HASH_KEY) === hash) return 'skipped';
  prefsStorage.set(HASH_KEY, hash);
  return 'replaced';
}

export function clearStoredHash(): void {
  prefsStorage.remove(HASH_KEY);
}
