import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, expect, mock, test } from 'bun:test';

import type { LoggedWatch } from '@/features/log-media/optimistic';
import type { NormalizedMediaItem } from '@/types/media';

GlobalRegistrator.register();
afterAll(() => GlobalRegistrator.unregister());
const { act, render } = await import('@testing-library/react');

mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: () => undefined,
    set: () => {},
    remove: () => {},
    getAllKeys: () => [],
    addOnValueChangedListener: () => ({ remove() {} }),
  }),
}));
mock.module('@/lib/haptics', () => ({ haptics: { selection: () => {} } }));
const { CatchUpLogProvider, useCatchUpControls } = await import('./state');
const { useLoggedWatches } = await import('@/features/log-media/logged-context');

const item: NormalizedMediaItem = {
  id: 'trakt-1',
  title: 'Frieren',
  coverImage: '',
  type: 'TV',
  currentProgress: 0,
  progressUnit: 'episode',
  lastUpdated: '',
  externalIds: { trakt: 1 },
};
const watch = (number: number): LoggedWatch => ({
  item,
  episodes: [{ season: 1, number }],
  entryEpisodes: [],
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a failed log goes back while another log is still in flight', async () => {
  let controls!: ReturnType<typeof useCatchUpControls>;
  let logged: readonly LoggedWatch[] = [];
  function Probe() {
    controls = useCatchUpControls();
    logged = useLoggedWatches();
    return null;
  }
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <CatchUpLogProvider>
        <Probe />
      </CatchUpLogProvider>
    </QueryClientProvider>,
  );
  const failed = Promise.withResolvers<void>();
  const slow = Promise.withResolvers<void>();
  const numbers = () => logged.map((held) => held.episodes[0].number);
  try {
    await act(async () => {
      controls.trackLog(watch(5), failed.promise);
      controls.trackLog(watch(6), slow.promise);
      await settle();
    });
    expect(numbers()).toEqual([5, 6]);

    await act(async () => {
      failed.reject(new Error('no answer'));
      await settle();
    });
    expect(numbers()).toEqual([6]);
  } finally {
    await act(async () => {
      slow.resolve();
      await settle();
    });
    view.unmount();
  }
});
