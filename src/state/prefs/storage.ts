import { createMMKV } from 'react-native-mmkv';

/** Keep cosmetic preferences in their own MMKV file, separate from session data. */
export const prefsStorage = createMMKV({ id: 'prefs' });

/**
 * MMKV's web fallback is localStorage, which must not be touched during
 * server rendering (docs/solutions/expo-web-ssr-mmkv-storage-on-server.md) —
 * every read in this directory goes through this guard.
 */
export function isServer(): boolean {
  return typeof window === 'undefined';
}
