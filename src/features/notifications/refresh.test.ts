import { describe, expect, mock, test } from 'bun:test';

import type { UpNextInputs } from '@/features/up-next/types';

// Import-time stubs only (see state/queries/up-next.test.ts): MMKV and
// react-native's entry point don't load under bun. `refreshNotifications`
// itself takes fully injected deps below, so nothing here is exercised.
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
mock.module('@/lib/http/client', () => ({
  httpFetch: async () => new Response('{}'),
}));
mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (spec: Record<string, unknown>) => spec.web },
}));
// `./refresh` reaches `@/state/queries/up-next` → `./mapping` → `./simkl`
// (plan 0034 U7), whose auth re-export reaches expo-crypto — mirror the
// surface it consumes instead of loading the whole expo package under bun
// (the `state/queries/simkl.test.ts` pattern).
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));

const { refreshNotifications } = await import('./refresh');
type RefreshNotificationsDeps = Parameters<typeof refreshNotifications>[0];

const EMPTY_INPUTS: UpNextInputs = {
  progress: [],
  calendar: [],
  releases: [],
  anilist: [],
  errors: [],
};

function makeDeps(overrides: Partial<RefreshNotificationsDeps> = {}) {
  const calls = { gather: 0, schedule: 0 };
  let throttled = false;
  const deps: RefreshNotificationsDeps = {
    isEnabled: () => true,
    isWeb: () => false,
    connectedProviders: () => ['trakt'],
    gatherInputs: async () => {
      calls.gather += 1;
      return EMPTY_INPUTS;
    },
    schedule: async () => {
      calls.schedule += 1;
      return 'replaced';
    },
    now: () => new Date('2026-07-23T12:00:00.000Z'),
    throttle: {
      isThrottled: () => throttled,
      record: () => {
        throttled = true;
      },
    },
    ...overrides,
  };
  return { deps, calls };
}

describe('refreshNotifications', () => {
  test('toggle off skips gathering entirely', async () => {
    const { deps, calls } = makeDeps({ isEnabled: () => false });
    await refreshNotifications(deps);
    expect(calls.gather).toBe(0);
  });

  test('web platform skips gathering entirely', async () => {
    const { deps, calls } = makeDeps({ isWeb: () => true });
    await refreshNotifications(deps);
    expect(calls.gather).toBe(0);
  });

  test('two foreground triggers within the throttle window run once', async () => {
    const { deps, calls } = makeDeps();
    await refreshNotifications(deps);
    await refreshNotifications(deps);
    expect(calls.gather).toBe(1);
    expect(calls.schedule).toBe(1);
  });

  test('the background task path bypasses the throttle', async () => {
    const { deps, calls } = makeDeps();
    await refreshNotifications(deps, { throttle: false });
    await refreshNotifications(deps, { throttle: false });
    expect(calls.gather).toBe(2);
  });

  test('a provider rejection surfaced as inputs.errors still schedules the rest', async () => {
    const { deps, calls } = makeDeps({
      gatherInputs: async () => ({
        ...EMPTY_INPUTS,
        errors: [{ provider: 'trakt', message: 'down' }],
      }),
    });
    await refreshNotifications(deps);
    expect(calls.schedule).toBe(1);
  });
});
