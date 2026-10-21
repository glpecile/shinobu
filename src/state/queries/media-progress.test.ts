import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

GlobalRegistrator.register();
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { act, renderHook, waitFor } = await import('@testing-library/react');

let readLibrary: () => Promise<unknown> = async () => { throw new Error('Unavailable'); };
const disabled = () => ({ isEnabled: false });
mock.module('@/state/session', () => ({ useConnectedProviders: () => ['simkl'] }));
mock.module('@/state/session/letterboxd', () => ({ getLetterboxdUsername: () => null }));
mock.module('@/state/session/serializd', () => ({ getSerializdUsername: () => null }));
mock.module('./anilist', () => ({ useAniListLibraryQuery: disabled }));
mock.module('./trakt', () => ({ useWatchedMoviesQuery: disabled, useWatchedShowsQuery: disabled }));
mock.module('./serializd', () => ({ useSerializdWatchedShowsQuery: disabled }));
mock.module('./letterboxd', () => ({ letterboxdFilmWatchQuery: () => ({ queryKey: ['unused-watch'], enabled: false }) }));
mock.module('./media-metadata', () => ({ useMediaMetadata: (items: unknown[]) => ({ items, queries: [] }) }));
mock.module('./simkl', () => ({
  simklLibraryQuery: () => ({ queryKey: ['progress-library'], queryFn: () => readLibrary() }),
  findLibraryEntry: () => null,
  findLibraryProgress: () => null,
}));
const { useMediaProgress } = await import('./media-progress');

test('retrying failed cached history stays busy through refetch and recovers', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['progress-library'], []);
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  const items = [{ id: 'tmdb-1', title: 'Film', type: 'MOVIE' as const, coverImage: '', currentProgress: 0,
    progressUnit: 'episode' as const, lastUpdated: '', externalIds: {} }];
  const view = renderHook(() => useMediaProgress(items), { wrapper });
  try {
    await waitFor(() => expect(view.result.current.failed).toBe(true));
    let complete!: (value: unknown) => void;
    readLibrary = () => new Promise((resolve) => { complete = resolve; });
    let retry!: Promise<unknown>;
    act(() => { retry = view.result.current.retry(); });
    await waitFor(() => expect(view.result.current.loading).toBe(true));
    await act(async () => { complete([]); await retry; });
    await waitFor(() => {
      expect(view.result.current.loading).toBe(false);
      expect(view.result.current.failed).toBe(false);
    });
  } finally {
    view.unmount();
    client.clear();
  }
});
