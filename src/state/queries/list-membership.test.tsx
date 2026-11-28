import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, expect, mock, spyOn, test } from 'bun:test';
import * as Effect from 'effect/Effect';
import type { ReactNode } from 'react';

import { Provider } from '@/lib/providers/types';
import type { ListEditTarget } from './list-membership';

GlobalRegistrator.register();
afterAll(() => GlobalRegistrator.unregister());
mock.module('react-native', () => ({ Platform: { OS: 'web' } }));
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: () => undefined,
    getAllKeys: () => [],
    addOnValueChangedListener: () => ({ remove() {} }),
  }),
}));
mock.module('@/lib/http/client', () => ({ httpFetch: () => Promise.reject(new Error('No network')) }));
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));
const hardcoverWrites = await import('@/lib/providers/hardcover/list-writes');
mock.module('@/lib/providers/hardcover/list-writes', () => ({
  ...hardcoverWrites,
  updateHardcoverList: () => Effect.succeed({ id: '1', name: 'New title' }),
}));
const { act, renderHook, waitFor } = await import('@testing-library/react');
const { useRenameList } = await import('./list-membership');

test('a Hardcover rename still confirms when its refreshed title changes its URL', async () => {
  const client = new QueryClient();
  const invalidation = Promise.withResolvers<void>();
  const invalidate = spyOn(client, 'invalidateQueries').mockImplementation(() => invalidation.promise);
  const confirmed = mock(() => {});
  const target: ListEditTarget = {
    provider: Provider.Hardcover,
    id: '1',
    username: 'reader',
    title: 'Old title',
    url: 'https://hardcover.app/@reader/lists/old-title',
  };
  const view = renderHook(({ current }: { current: ListEditTarget }) => useRenameList(current), {
    initialProps: { current: { ...target } },
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  try {
    act(() => view.result.current.mutate({ name: 'New title' }, { onSuccess: confirmed }));
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    view.rerender({
      current: {
        ...target,
        title: 'New title',
        url: 'https://hardcover.app/@reader/lists/new-title',
      },
    });
    await act(async () => invalidation.resolve());
    await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1));
  } finally {
    await act(async () => view.unmount());
    invalidate.mockRestore();
    client.clear();
  }
});
