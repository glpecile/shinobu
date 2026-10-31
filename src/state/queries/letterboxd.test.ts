import { InfiniteQueryObserver, QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { createElement, Suspense } from 'react';
import { renderToString } from 'react-dom/server';

import type { HttpFetch } from '@/lib/http/types';
import type { TmdbMediaCatalogue } from '@/lib/providers/tmdb/normalize';
import type { NormalizedMediaItem } from '@/types/media';

// Import-time stubs only: MMKV, the native fetch client and react-native's
// entry point don't load under bun.
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
let readResponse = () => new Response('{}');
let readPublic: HttpFetch = async () => readResponse();
mock.module('@/lib/http/client', () => ({ httpFetch: (input: RequestInfo | URL, init?: RequestInit) => readPublic(input, init) }));
mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (spec: Record<string, unknown>) => spec.web },
}));
// `./letterboxd` imports `./mapping`, which imports `./simkl` (plan 0034 U7),
// whose auth re-export reaches expo-crypto — mirror the surface it consumes
// instead of loading the whole expo package under bun (the
// `state/queries/simkl.test.ts` pattern).
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));

// The TMDB token read is gated on `isServer()` (`typeof window === 'undefined'`,
// docs/solutions/expo-web-ssr-mmkv-storage-on-server.md) and bun has no
// `window`. That gate is also what makes the no-token case testable at all:
// `tmdbToken()` memoizes the first *client* read for the process, so the
// no-token suite below runs first, while `window` is still absent, and the
// window is only faked in for the suites that need a token. Removed afterwards
// — bun shares one process across files.
const globals = globalThis as { window?: unknown };
afterAll(() => {
  delete globals.window;
});

const { fetchLetterboxdReleaseInputs, findInLetterboxdListsCache, letterboxdQueryKeys, letterboxdFilmQuery, letterboxdFilmWatchQuery, useLetterboxdListLike, useLetterboxdListsQuery, useSuspenseLetterboxdListsQuery, useSuspenseLetterboxdListFilmsQuery } = await import(
  './letterboxd'
);
// Written through the session layer's own setters rather than into the map
// above: `mock.module` is process-wide and the last registration wins, so
// `tokens.ts` may well have captured another suite's fake MMKV. Going through
// the real writers lands the session in whichever store is actually live.
const { setProviderSession, clearProviderSession, setStoredTmdbToken } = await import(
  '@/state/session/tokens'
);

const NOW = new Date('2026-07-27T12:00:00.000Z');

test('a cold or partial liked-list index stays unknown instead of claiming unliked', () => {
  const client = new QueryClient();
  let liked: boolean | undefined;
  function Read() {
    liked = useLetterboxdListLike('gian', 'melis_', 'black-mirror').liked;
    return null;
  }
  const render = () => renderToString(createElement(QueryClientProvider, { client }, createElement(Read)));
  const key = letterboxdQueryKeys.lists('gian', 'liked');
  try {
    render();
    expect(liked).toBeUndefined();
    client.setQueryData(key, { pages: [{ lists: [], hasNextPage: true }], pageParams: [1] });
    render();
    expect(liked).toBeUndefined();
    client.setQueryData(key, { pages: [{ lists: [{ owner: 'MELIS_', slug: 'black-mirror' }], hasNextPage: true }], pageParams: [1] });
    render();
    expect(liked).toBe(true);
    client.setQueryData(key, { pages: [{ lists: [], hasNextPage: false }], pageParams: [1] });
    render();
    expect(liked).toBe(false);
  } finally {
    client.clear();
  }
});

test('list likes share optimistic state across buttons and remounts, and roll back failed unlikes', async () => {
  const { registerLetterboxdWebView, handleLetterboxdMessage } = await import('@/lib/providers/letterboxd/webview-bridge');
  setProviderSession('letterboxd', { accessToken: '', username: 'gian', cookie: 'session', csrf: 'csrf' });
  const client = new QueryClient();
  const listsKey = letterboxdQueryKeys.lists('gian', 'liked');
  client.setQueryData(listsKey, { pages: [{ lists: [], hasNextPage: false }], pageParams: [1] });
  const index = new InfiniteQueryObserver(client, {
    queryKey: listsKey, initialPageParam: 1, getNextPageParam: () => undefined, staleTime: Infinity, retry: false,
  });
  const unsubscribe = index.subscribe(() => {});
  let reads = 0;
  readResponse = () => { reads += 1; return new Response('<div class="list-summary-list"></div>'); };
  let mutation!: ReturnType<typeof useLetterboxdListLike>;
  function LikeRead() {
    useLetterboxdListsQuery('gian', 'liked');
    mutation = useLetterboxdListLike('gian', 'jack', 'classics');
    return createElement('button', { 'aria-pressed': mutation.liked, disabled: mutation.isPending }, mutation.liked ? 'Unlike' : 'Like');
  }
  const render = () => renderToString(createElement(QueryClientProvider, { client }, createElement(LikeRead)));
  let loaded = Promise.withResolvers<string>();
  registerLetterboxdWebView({ loadPage: (id) => loaded.resolve(id), unloadPage: () => {} });
  try {
    expect(render()).toContain('aria-pressed="false"');
    const like = mutation.mutateAsync(true);
    const likeId = await loaded.promise;
    expect(render()).toContain('aria-pressed="true" disabled=""');
    handleLetterboxdMessage(JSON.stringify({ id: likeId, status: 200, body: '{"result":true,"liked":true}' }));
    await like;
    expect(reads).toBe(1);
    expect(index.getCurrentResult().isError).toBe(false);
    expect(render()).toContain('aria-pressed="true"');

    loaded = Promise.withResolvers<string>();
    const unlike = mutation.mutateAsync(false).catch((error: unknown) => error);
    const unlikeId = await loaded.promise;
    expect(render()).toContain('aria-pressed="false" disabled=""');
    handleLetterboxdMessage(JSON.stringify({ id: unlikeId, status: 429, body: '' }));
    expect(await unlike).toMatchObject({ _tag: 'ProviderRateLimitError' });
    expect(reads).toBe(2);
    expect(render()).toContain('aria-pressed="true"');
  } finally {
    registerLetterboxdWebView(null);
    unsubscribe();
    readResponse = () => new Response('{}');
    client.clear();
    clearProviderSession('letterboxd');
  }
});

test('blocked list reads settle inline without retrying on remount, and an explicit retry can recover', async () => {
  let retry: (() => Promise<unknown>) | undefined;
  function IndexRead() {
    const pages = useSuspenseLetterboxdListsQuery('jack', 'liked');
    retry = () => pages.refetch();
    return createElement('div', null, pages.data == null ? 'blocked' : 'loaded');
  }
  function FilmsRead() {
    const pages = useSuspenseLetterboxdListFilmsQuery('jack', 'classics');
    retry = () => pages.refetch();
    return createElement('div', null, pages.data == null ? 'blocked' : 'loaded');
  }
  for (const [Read, html] of [
    [IndexRead, '<div class="list-summary-list"></div>'],
    [FilmsRead, '<h1 class="title-1">Classics</h1>'],
  ] as const) {
    const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    let requests = 0;
    readResponse = () => { requests += 1; return Response.json({ error: 'upstream challenged' }, { status: 502 }); };
    const render = () => renderToString(createElement(QueryClientProvider, { client },
      createElement(Suspense, { fallback: 'loading' }, createElement(Read)),
    ));
    try {
      expect(render()).toContain('loading');
      await Promise.all(client.getQueryCache().getAll().map((query) => query.promise?.catch(() => {})));
      expect(render()).toContain('<div>blocked</div>');
      expect(render()).toContain('<div>blocked</div>');
      expect(requests).toBe(1);
      expect(client.getQueryCache().getAll()[0].state).toMatchObject({ status: 'error', data: undefined });
      readResponse = () => new Response(html);
      await retry!();
      expect(render()).toContain('<div>loaded</div>');
    } finally {
      client.clear();
      readResponse = () => new Response('{}');
    }
  }
});

/**
 * A watchlist row. `tmdb` is the one liberty these fixtures take: a real scrape
 * never carries an id, but the id leg (`cachedTmdbMovieIdByTitle`) is a module
 * import rather than a `fetchQuery` key, and other suites replace that module
 * process-wide. Pre-supplying the id isolates what *this* layer owns — the
 * filter, the catalogue read and the query keys — while the year-gated matching
 * it would otherwise run is covered in `features/up-next/letterboxd-releases.test.ts`.
 */
function film(
  slug: string,
  title: string,
  year?: number,
  tmdb?: number,
): NormalizedMediaItem {
  return {
    id: `letterboxd-${slug}`,
    title,
    coverImage: '',
    ...(year != null ? { year } : {}),
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-27T00:00:00.000Z',
    externalIds: { letterboxd: slug, ...(tmdb != null ? { tmdb } : {}) },
  };
}

test('a film on a later list page resolves for details without fetching any lists', () => {
  const client = new QueryClient();
  client.setQueryData(letterboxdQueryKeys.listFilms('jack', 'classics'), {
    pages: [
      { title: 'Classics', items: [film('heat', 'Heat')], hasNextPage: true },
      { title: 'Classics', items: [film('21-grams', '21 Grams')], hasNextPage: false },
    ],
    pageParams: [1, 2],
  });
  expect(findInLetterboxdListsCache(client, 'letterboxd-21-grams')?.title).toBe('21 Grams');
  expect(findInLetterboxdListsCache(client, 'letterboxd-missing')).toBeUndefined();
});

interface Scenario {
  watchlist?: NormalizedMediaItem[];
  /** TMDB id → its `releaseCalendar`, as the catalogue read carries it. */
  dates?: Record<number, NormalizedMediaItem['releaseCalendar']>;
  /** TMDB ids whose catalogue read rejects. */
  failingCatalogue?: number[];
  failingWatchlist?: boolean;
}

/**
 * Every leg of the resolve goes through `queryClient.fetchQuery`, so a client
 * that answers by query key is the whole seam — and the keys it is asked for
 * are the assertion that the watchlist read shares the feed row's cache entry
 * and that the id mapping is the forever-cached one.
 */
function fakeClient(scenario: Scenario) {
  const keys: unknown[][] = [];
  const fetchQuery = async ({ queryKey }: { queryKey: readonly unknown[] }) => {
    keys.push([...queryKey]);
    const [root, kind] = queryKey as [string, string];
    if (root === 'letterboxd' && kind === 'watchlist') {
      if (scenario.failingWatchlist === true) throw new Error('watchlist 429');
      return scenario.watchlist ?? [];
    }
    if (root === 'mapping' && kind === 'tmdb-movie-search') return null;
    if (root === 'tmdb' && kind === 'catalogue') {
      const tmdbId = queryKey[3] as number;
      if (scenario.failingCatalogue?.includes(tmdbId) === true) {
        throw new Error(`catalogue ${tmdbId} down`);
      }
      return {
        catalogue: {
          id: `tmdb-${tmdbId}`,
          title: `TMDB ${tmdbId}`,
          coverImage: '',
          type: 'MOVIE',
          currentProgress: 0,
          progressUnit: 'episode',
          lastUpdated: '2026-07-27T00:00:00.000Z',
          externalIds: { tmdb: tmdbId },
          ...(scenario.dates?.[tmdbId] != null
            ? { releaseCalendar: scenario.dates[tmdbId] }
            : {}),
        },
        cast: [],
        crew: [],
        studios: [],
      } satisfies TmdbMediaCatalogue;
    }
    throw new Error(`unexpected query: ${queryKey.join('/')}`);
  };
  return { client: { fetchQuery } as unknown as QueryClient, keys };
}

describe('fetchLetterboxdReleaseInputs — without a TMDB token', () => {
  beforeAll(() => {
    setProviderSession('letterboxd', { accessToken: '', username: 'cinephile' });
  });

  test('contributes nothing and spends no request', async () => {
    const { client, keys } = fakeClient({
      watchlist: [film('the-drama', 'The Drama', 2026)],
    });

    // There is no resolve without a token, so firing the scrape would buy
    // nothing — the source degrades to absent, never to an error.
    expect(await fetchLetterboxdReleaseInputs(client, NOW)).toEqual([]);
    expect(keys).toEqual([]);
  });
});

describe('fetchLetterboxdReleaseInputs', () => {
  beforeAll(() => {
    setProviderSession('letterboxd', { accessToken: '', username: 'cinephile' });
    setStoredTmdbToken('tmdb-read-token');
    globals.window = {};
  });

  test('resolves the filtered watchlist into dated, letterboxd-tagged inputs', async () => {
    const { client, keys } = fakeClient({
      watchlist: [
        film('the-drama', 'The Drama', 2026, 1234),
        film('casablanca', 'Casablanca', 1942, 4321),
      ],
      dates: { 1234: { theatrical: '2026-07-31', digital: '2026-09-04' } },
    });

    const inputs = await fetchLetterboxdReleaseInputs(client, NOW);

    expect(inputs.map((input) => [input.kind, input.date, input.source])).toEqual([
      ['theatrical', '2026-07-31', 'letterboxd'],
      ['digital', '2026-09-04', 'letterboxd'],
    ]);
    // The 1942 film never reaches a request: the year filter runs before the fan
    // (KTD-5), which is the whole reason this source is affordable.
    expect(keys.filter((key) => key[1] === 'catalogue')).toEqual([
      ['tmdb', 'catalogue', 'movie', 1234],
    ]);
    // The watchlist read shares the Letterboxd watchlist feed row's cache entry, so
    // on the home screen the scrape has usually already happened.
    expect(keys[0]).toEqual([...letterboxdQueryKeys.watchlist('cinephile')]);
  });

  test('a film no TMDB id could be found for contributes no entry', async () => {
    const { client } = fakeClient({
      watchlist: [film('the-odyssey', 'The Odyssey', 2026)],
    });

    // The id leg's year gate returns null rather than Kubrick's back catalogue
    // (docs/solutions/trakt-text-search-wrong-movie-match.md); a null id has to
    // stop the resolve dead instead of falling through to some other film.
    expect(await fetchLetterboxdReleaseInputs(client, NOW)).toEqual([]);
  });

  test('a failing catalogue read drops that film, not the source (R7)', async () => {
    const { client } = fakeClient({
      watchlist: [
        film('broken', 'Broken', 2026, 1),
        film('survivor', 'Survivor', 2026, 2),
      ],
      dates: { 2: { theatrical: '2026-08-01' } },
      failingCatalogue: [1],
    });

    const inputs = await fetchLetterboxdReleaseInputs(client, NOW);

    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.item.id).toBe('letterboxd-survivor');
    // The resolved TMDB id rides on the item — without it the row could never
    // collapse against the same film on the Trakt watchlist (KTD-6).
    expect(inputs[0]?.item.externalIds.tmdb).toBe(2);
  });

  test('a watchlist that will not load settles as a Letterboxd error, not a throw', async () => {
    // Lives here rather than in `up-next.test.ts` because reaching the resolve at all needs a TMDB
    // token, and `tmdbToken()` memoizes its first client read for the whole
    // process — so the suite that fakes a `window` in has to be the one that
    // already owns that state.
    const { fetchUpNextInputs } = await import('./up-next');
    const { client } = fakeClient({ failingWatchlist: true });

    const inputs = await fetchUpNextInputs(client, ['letterboxd']);

    expect(inputs.releases).toEqual([]);
    expect(inputs.errors).toEqual([
      { provider: 'letterboxd', message: 'watchlist 429' },
    ]);
  });
});


test('confirmed membership additions stay visible in a partially loaded list until an explicit refresh', async () => {
  const { useListMembership } = await import('./list-membership');
  const { registerLetterboxdWebView, handleLetterboxdMessage } = await import('@/lib/providers/letterboxd/webview-bridge');
  setProviderSession('letterboxd', { accessToken: '', username: 'gian', cookie: 'session', csrf: 'csrf' });
  const client = new QueryClient();
  const key = letterboxdQueryKeys.listFilms('gian', 'classics');
  const original = { pages: [{ title: 'Classics', items: [], hasNextPage: true }], pageParams: [1] };
  client.setQueryData(key, original);
  let reads = 0;
  const observer = new InfiniteQueryObserver(client, {
    queryKey: key, initialPageParam: 1, getNextPageParam: () => 2, staleTime: Infinity,
    queryFn: async () => { reads += 1; return original.pages[0]; },
  });
  const unsubscribe = observer.subscribe(() => {});
  let mutation!: ReturnType<typeof useListMembership>;
  function Read() {
    mutation = useListMembership({ provider: 'letterboxd', username: 'gian', owner: 'gian', slug: 'classics', title: 'Classics', url: 'https://letterboxd.com/gian/list/classics/' });
    return null;
  }
  const loaded = Promise.withResolvers<string>();
  registerLetterboxdWebView({ loadPage: (id) => loaded.resolve(id), unloadPage: () => {} });
  try {
    renderToString(createElement(QueryClientProvider, { client }, createElement(Read)));
    const item: NormalizedMediaItem = { id: 'tmdb-movie-348', title: 'Alien', type: 'MOVIE', coverImage: '', currentProgress: 0, progressUnit: 'episode', lastUpdated: '', externalIds: { tmdb: 348 } };
    const added = mutation.mutateAsync({ item, present: true });
    handleLetterboxdMessage(JSON.stringify({ id: await loaded.promise, status: 200, body: '{"result":true,"present":true,"filmSlug":"alien"}' }));
    await added;
    expect(client.getQueryData<{ pages: { items: NormalizedMediaItem[] }[] }>(key)?.pages.flatMap((page) => page.items).map((entry) => entry.id)).toContain('letterboxd-alien');
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(reads).toBe(0);
    await observer.refetch();
    expect(reads).toBe(1);
    expect(observer.getCurrentResult().data?.pages[0].items).toEqual([]);
  } finally {
    registerLetterboxdWebView(null);
    unsubscribe();
    client.clear();
    clearProviderSession('letterboxd');
  }
});

test('cold film identities and watches share a bounded queue that drains and cancels on unsubscribe', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const pending: { url: string; resolve: (response: Response) => void }[] = [];
  let started = 0;
  let active = 0;
  let peak = 0;
  let aborted = 0;
  const unsubscribes: (() => void)[] = [];
  readPublic = (input, init) => new Promise((resolve, reject) => {
    const signal = init!.signal!;
    started += 1;
    active += 1;
    peak = Math.max(peak, active);
    signal.addEventListener('abort', () => {
      active -= 1;
      aborted += 1;
      reject(signal.reason);
    }, { once: true });
    pending.push({ url: String(input), resolve: (response) => { active -= 1; resolve(response); } });
  });
  const subscribe = (prefix: string) => {
    for (let index = 0; index < 40; index += 1) {
      const slug = `${prefix}-${index}`;
      unsubscribes.push(new QueryObserver(client, letterboxdFilmQuery(slug, false)).subscribe(() => {}));
      const item = film(slug, slug);
      if (index % 2 === 1) item.externalIds = { tmdb: index + (prefix === 'complete' ? 1 : 1001) };
      unsubscribes.push(new QueryObserver(client, letterboxdFilmWatchQuery('gian', item)).subscribe(() => {}));
    }
  };
  try {
    subscribe('complete');
    await Bun.sleep(0);
    expect(started).toBe(4);
    while (pending.length > 0) {
      const request = pending.shift()!;
      const tmdb = /\/tmdb\/([0-9]+)\//.exec(request.url)?.[1];
      if (tmdb != null) {
        request.resolve(new Response(null, { status: 302, headers: { location: `/film/resolved-${tmdb}/` } }));
        await Bun.sleep(0);
        continue;
      }
      const slug = /\/film\/([^/]+)\//.exec(request.url)![1];
      request.resolve(new Response(request.url.includes('/gian/')
        ? `<body data-owner="gian"><section class="film-viewing-info-wrapper"><a href="/film/${slug}/">Film</a></section>`
        : `<body data-tmdb-id="1" data-tmdb-type="movie"><script type="application/ld+json">{"@type":"Movie","name":"Film"}</script>`));
      await Bun.sleep(0);
    }
    await Promise.all(client.getQueryCache().getAll().map((query) => query.promise));
    expect(started).toBe(100);
    expect(peak).toBe(4);
    expect(client.getQueryCache().getAll().every((query) => query.state.status === 'success')).toBe(true);
    subscribe('cancel');
    await Bun.sleep(0);
    expect(started).toBe(104);
    unsubscribes.forEach((unsubscribe) => unsubscribe());
    await Bun.sleep(0);
    expect(aborted).toBe(4);
    expect(started).toBe(104);
    expect(active).toBe(0);
    pending.length = 0;
    const sharedItem = { ...film('shared', 'Shared'), externalIds: { tmdb: 2001 } };
    const first = new QueryObserver(client, letterboxdFilmWatchQuery('gian', sharedItem));
    const second = new QueryObserver(client, letterboxdFilmWatchQuery('other', sharedItem));
    const unsubscribeFirst = first.subscribe(() => {});
    unsubscribes.push(unsubscribeFirst, second.subscribe(() => {}));
    await Bun.sleep(0);
    expect(started).toBe(105);
    unsubscribeFirst();
    await Bun.sleep(0);
    expect(aborted).toBe(4);
    pending.shift()!.resolve(new Response(null, { status: 302, headers: { location: '/film/shared/' } }));
    await Bun.sleep(0);
    expect(started).toBe(106);
    expect(pending[0].url).toBe('https://letterboxd.com/other/film/shared/');
    pending.shift()!.resolve(new Response('<body data-owner="other"><section class="film-viewing-info-wrapper"><a href="/film/shared/">Shared</a></section>'));
    await Bun.sleep(0);
    expect(second.getCurrentResult().data?.currentProgress).toBe(1);
  } finally {
    unsubscribes.forEach((unsubscribe) => unsubscribe());
    client.clear();
    readPublic = async () => readResponse();
  }
});
