import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

/**
 * Trakt detachment derived state (plan 0034 U9, R12/R13).
 *
 * The Planning Contract's state diagram: a stored token *without* resolvable
 * credentials is `MigrationNeeded` — Trakt is gated out of every read/write
 * leg (one predicate, consumed by `useConnectedProviders`), the banner state
 * is on, and the session is never cleared. Env credentials no longer exist as
 * an activation path.
 */

const store = new Map<string, string>();
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => store.get(key),
    set: (key: string, value: string) => store.set(key, value),
    remove: (key: string) => store.delete(key),
    getAllKeys: () => [...store.keys()],
    addOnValueChangedListener: () => ({ remove() {} }),
  }),
}));
// provider-config reaches anilist/config, which imports react-native for
// Platform.select (native vs web client id) — mirror just that surface.
mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (spec: Record<string, unknown>) => spec.web },
}));

const {
  providerIsUsable,
  traktNeedsCredentials,
  usableProviderIds,
} = await import('./trakt-migration');
const { setProviderClientId, setProviderSession } = await import('./tokens');
const { getClientIdForProvider } = await import('./provider-config');
const { traktClientId, traktClientSecret } = await import(
  '@/lib/providers/trakt/config'
);

const ORIGINAL_ENV_ID = process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID;
const ORIGINAL_ENV_SECRET = process.env.EXPO_PUBLIC_TRAKT_CLIENT_SECRET;

beforeEach(() => {
  store.clear();
  delete process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID;
  delete process.env.EXPO_PUBLIC_TRAKT_CLIENT_SECRET;
});

afterAll(() => {
  process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID = ORIGINAL_ENV_ID;
  process.env.EXPO_PUBLIC_TRAKT_CLIENT_SECRET = ORIGINAL_ENV_SECRET;
});

describe('env detachment (R12)', () => {
  test('EXPO_PUBLIC_TRAKT_* env vars no longer activate Trakt', () => {
    process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID = 'env-cid';
    process.env.EXPO_PUBLIC_TRAKT_CLIENT_SECRET = 'env-secret';

    expect(traktClientId()).toBe('');
    expect(traktClientSecret()).toBe('');
    // The provider-config merge resolves only user-stored credentials.
    expect(getClientIdForProvider('trakt')).toBe('');
  });

  test('.env.template carries no Trakt entries', () => {
    const template = readFileSync(
      join(import.meta.dir, '../../../.env.template'),
      'utf8',
    );
    expect(template).not.toContain('EXPO_PUBLIC_TRAKT');
  });
});

describe('MigrationNeeded: token stored, no user creds (R13)', () => {
  test('traktNeedsCredentials is true and Trakt is gated out of the usable set', () => {
    setProviderSession('trakt', { accessToken: 'old-token' });

    expect(traktNeedsCredentials()).toBe(true);
    expect(providerIsUsable('trakt')).toBe(false);
    expect(usableProviderIds()).not.toContain('trakt');
    // The gate must not clear the stored session — the token is the evidence
    // the banner is derived from.
    expect(store.get('session.trakt')).toBeDefined();
  });

  test('other connected providers are unaffected by the Trakt gate', () => {
    setProviderSession('trakt', { accessToken: 'old-token' });
    setProviderSession('anilist', { accessToken: 'al-token' });
    setProviderSession('simkl', { accessToken: 'sk-token' });

    const usable = usableProviderIds();
    expect(usable).toContain('anilist');
    expect(usable).toContain('simkl');
    expect(usable).not.toContain('trakt');
  });
});

describe('Connected: token + user creds (regression)', () => {
  test('stored credentials keep Trakt fully usable, no banner state', () => {
    setProviderSession('trakt', { accessToken: 'tok' });
    setProviderClientId('trakt', 'byo-cid');

    expect(traktNeedsCredentials()).toBe(false);
    expect(providerIsUsable('trakt')).toBe(true);
    expect(usableProviderIds()).toContain('trakt');
  });
});

describe('Disconnected: no token', () => {
  test('needsCredentials is false and Trakt is simply not connected', () => {
    expect(traktNeedsCredentials()).toBe(false);
    expect(usableProviderIds()).not.toContain('trakt');
  });

  test('credentials without a token are still just disconnected (setup saved, OAuth pending)', () => {
    setProviderClientId('trakt', 'byo-cid');

    expect(traktNeedsCredentials()).toBe(false);
    expect(usableProviderIds()).not.toContain('trakt');
  });
});
