import { createMMKV } from 'react-native-mmkv';

/**
 * Local-only UI preferences (collapsed feed rows, hidden feed items).
 * Deliberately a separate MMKV file from `state/session` — preferences are
 * cosmetic and must never touch auth state; disconnect/reconnect flows leave
 * them alone.
 */
export const prefsStorage = createMMKV({ id: 'prefs' });

/**
 * MMKV's web fallback is localStorage, which must not be touched during
 * server rendering (docs/solutions/expo-web-ssr-mmkv-storage-on-server.md) —
 * every read in this directory goes through this guard.
 */
export function isServer(): boolean {
  return typeof window === 'undefined';
}
