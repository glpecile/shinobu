import { expect, mock, test } from 'bun:test';

const requests: unknown[] = [];
const queued: string[] = [];

// Keep Nitro Fetch's request validation real; replace only the native JSI boundary.
mock.module('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: () => ({
      createClient: () => ({
        prefetch: async (request: unknown) => {
          requests.push(request);
        },
      }),
      saveAutoPrefetchEntry: async (entry: string) => {
        queued.push(entry);
      },
    }),
    box: (value: unknown) => value,
  },
}));

const { warmProviderConnections } = await import('./warm-connections');

test('native connection warmups reach the transport once per session', async () => {
  warmProviderConnections(['simkl']);
  await new Promise<void>((resolve) => setImmediate(resolve));
  const initialCount = queued.length;
  expect(requests).toHaveLength(initialCount);
  expect(initialCount).toBeGreaterThan(0);

  warmProviderConnections(['simkl']);
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(requests).toHaveLength(initialCount);
  expect(queued).toHaveLength(initialCount);
});
