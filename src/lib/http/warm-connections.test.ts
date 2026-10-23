import { expect, mock, test } from 'bun:test';

const requests: unknown[] = [];
const stored = new Map<string, string>();

// Keep Nitro Fetch's request validation real; replace only the native JSI boundary.
mock.module('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: (name: string) => {
      if (name === 'NativeStorage') return {
        getSecureString: (key: string) => stored.get(key),
        setSecureString: (key: string, value: string) => stored.set(key, value),
      };
      return { createClient: () => ({ prefetch: async (request: unknown) => { requests.push(request); } }) };
    },
    box: (value: unknown) => value,
  },
}));

const { warmProviderConnections } = await import('./warm-connections');

test('native connection warmups reach the transport once per session', async () => {
  warmProviderConnections(['simkl']);
  await new Promise<void>((resolve) => setImmediate(resolve));
  const queue = JSON.parse([...stored.values()][0]!) as { url: string }[];
  expect(requests).toHaveLength(queue.length);
  expect(requests.length).toBeGreaterThan(0);

  warmProviderConnections(['simkl']);
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(requests).toHaveLength(queue.length);
});
