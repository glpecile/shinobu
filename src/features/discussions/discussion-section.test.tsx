import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, mock, test } from 'bun:test';
import { Suspense, type ReactNode } from 'react';

import type { NormalizedMediaItem } from '@/types/media';

GlobalRegistrator.register();
const { render, waitFor } = await import('@testing-library/react');
const item: NormalizedMediaItem = {
  id: 'tmdb-tv-209867', title: 'Frieren: Beyond Journey’s End', type: 'TV',
  coverImage: '', currentProgress: 0, progressUnit: 'episode', lastUpdated: '',
  externalIds: { tmdb: 209867 }, genres: ['Animation'],
};
let mapping = { data: null as number | null, isLoading: true };
let anime = { data: undefined as NormalizedMediaItem | undefined, isLoading: false };
const requests: string[] = [];
mock.module('@/state/queries/mapping', () => ({ useAniListIdByTmdbQuery: () => mapping }));
mock.module('@/state/queries/anilist', () => ({ useAnimeByIdQuery: () => anime }));
mock.module('@/lib/http/client', () => ({ httpFetch: async (url: string) => {
  if (url.includes('reddit')) {
    requests.push(url);
    return new Response('<feed><entry><id>t3_abc</id><title>Sousou no Frieren discussion</title></entry></feed>');
  }
  return Response.json([{ threads: [{ no: 1, sub: 'Frieren: Beyond Journey’s End discussion' }] }]);
} }));
const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
mock.module('react-native', () => ({ Text: Box, View: Box }));
mock.module('react-native-reanimated', () => ({ useReducedMotion: () => true }));
mock.module('@/lib/motion', () => ({ DURATION: { swap: 180 }, EASE_OUT: 'ease-out' }));
mock.module('@/components/animated-view', () => ({ AnimatedView: Box }));
mock.module('@/components/button', () => ({ Button: Object.assign(() => null, { Icon: () => null }) }));
mock.module('@/components/rail', () => ({ Rail: Box }));
mock.module('@/components/section', () => ({ Section: Object.assign(Box, { Header: Box, Title: Box }) }));
mock.module('@/components/sheet', () => ({ Sheet: Object.assign(() => null, { Header: Box }) }));
mock.module('@/components/suspense-section', () => ({
  SuspenseSection: ({ children, fallback }: { children: ReactNode; fallback: ReactNode }) =>
    <Suspense fallback={fallback}>{children}</Suspense>,
}));
mock.module('@/lib/open-external-url', () => ({ openExternalUrl: () => {} }));
mock.module('@/lib/open-external-url/use-link-handoff', () => ({ useLinkHandoff: () => ({ loading: false, open: () => {} }) }));
mock.module('./discussion-card', () => ({
  DiscussionCard: ({ site }: { site: string }) => <span>{site}</span>,
}));
const { DiscussionSection } = await import('./discussion-section');

test('keeps 4chan visible and spends one Reddit request after anime identity and titles resolve', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = () => <QueryClientProvider client={client}><DiscussionSection item={item} /></QueryClientProvider>;
  const view = render(screen());
  try {
    await view.findAllByText('4chan');
    expect(requests).toHaveLength(0);
    mapping = { data: 154587, isLoading: false };
    anime = { data: undefined, isLoading: true };
    view.rerender(screen());
    expect(requests).toHaveLength(0);
    anime = { data: { ...item, titles: { romaji: 'Sousou no Frieren' } }, isLoading: false };
    view.rerender(screen());
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toContain('/anime/search.rss?q=Sousou%20no%20Frieren');
    await view.findByText('Reddit');
    expect(view.getAllByText('4chan').length).toBeGreaterThan(0);
  } finally {
    view.unmount();
    client.clear();
  }
});
