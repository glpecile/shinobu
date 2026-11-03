import { describe, expect, test } from 'bun:test';
import * as Effect from 'effect/Effect';

import type { TmdbSearchResponse } from './normalize';
import { searchTitlesFuzzy } from './fuzzy-search';

type Hit = NonNullable<TmdbSearchResponse['results']>[number];

function searchFetch(results: Record<string, Hit[] | number>, requests: string[]) {
  return (input: RequestInfo | URL): Promise<Response> => {
    const query = new URL(String(input)).searchParams.get('query') ?? '';
    requests.push(query);
    const result = results[query] ?? [];
    return Promise.resolve(typeof result === 'number'
      ? new Response('', { status: result })
      : Response.json({ results: result }));
  };
}

describe('searchTitlesFuzzy', () => {
  test('ranks folded exact titles before prefixes, substrings, and unknown aliases; ties keep TMDB order', async () => {
    const requests: string[] = [];
    const results = await Effect.runPromise(searchTitlesFuzzy({
      token: 'test',
      fetch: searchFetch({ 'CAFE racer': [
        { id: 1, media_type: 'movie', title: 'An unrelated display title' },
        { id: 2, media_type: 'movie', title: 'Café Racer Returns' },
        { id: 3, media_type: 'movie', title: 'The Café Racer' },
        { id: 4, media_type: 'movie', title: 'Café—Racer', release_date: '2020-01-01' },
        { id: 5, media_type: 'movie', title: 'Cafe Racer', release_date: '1990-01-01' },
      ] }, requests),
    }, { query: '  CAFE racer  ' }));
    expect(results.map((item) => item.externalIds.tmdb)).toEqual([4, 5, 2, 3, 1]);
    expect(requests).toHaveLength(1);
  });

  test.each([
    ['breakng bad', 'bad', 'Breaking Bad'],
    ['breakinng bad', 'bad', 'Breaking Bad'],
    ['spirited awya', 'spirited', 'Spirited Away'],
    ['matrx', 'matr', 'The Matrix'],
  ])('recovers %s from a broader candidate query', async (query, fallback, title) => {
    const requests: string[] = [];
    const results = await Effect.runPromise(searchTitlesFuzzy({
      token: 'test',
      fetch: searchFetch({ [fallback]: [
        { id: 1, media_type: 'movie', title },
        { id: 2, media_type: 'movie', title: 'Matrimony' },
      ] }, requests),
    }, { query }));
    expect(results.map((item) => item.title)).toEqual([title]);
    expect(requests.length).toBeLessThanOrEqual(3);
  });

  test('keeps a literal typo-shaped title first, dedupes suggestions by kind/id, and rejects unrelated supplements', async () => {
    const requests: string[] = [];
    const results = await Effect.runPromise(searchTitlesFuzzy({
      token: 'test',
      fetch: searchFetch({
        'star wras': [{ id: 1, media_type: 'movie', title: 'Star Wras', release_date: '2025-01-01' }],
        star: [
          { id: 1, media_type: 'movie', title: 'Do not replace the direct record' },
          { id: 2, media_type: 'movie', title: 'Star Wars' },
          { id: 2, media_type: 'tv', name: 'Star Wars' },
          { id: 3, media_type: 'movie', title: 'Star Trek' },
        ],
        wras: [{ id: 2, media_type: 'movie', title: 'Star Wars' }],
      }, requests),
    }, { query: 'star wras' }));
    expect(results.map((item) => [item.id, item.title])).toEqual([
      ['tmdb-movie-1', 'Star Wras'],
      ['tmdb-movie-2', 'Star Wars'],
      ['tmdb-tv-2', 'Star Wars'],
    ]);
    expect(results[0]?.year).toBe(2025);
    expect(requests).toHaveLength(3);
  });

  test('matches original movie and TV titles even when the display title is translated', async () => {
    const requests: string[] = [];
    const results = await Effect.runPromise(searchTitlesFuzzy({
      token: 'test',
      fetch: searchFetch({ fabuleux: [
        { id: 1, media_type: 'movie', title: 'Amélie', original_title: 'Le Fabuleux Destin d’Amélie Poulain' },
        { id: 2, media_type: 'tv', name: 'The Fabulous Show', original_name: 'Le Fabuleux Spectacle' },
      ] }, requests),
    }, { query: 'le fabuleux' }));
    expect(results.map((item) => item.id)).toEqual(['tmdb-movie-1', 'tmdb-tv-2']);
  });

  test('single-word prefixes preserve Unicode code points and successful direct results', async () => {
    const requests: string[] = [];
    const results = await Effect.runPromise(searchTitlesFuzzy({
      token: 'test',
      fetch: searchFetch({
        'こちら𠮷田': [{ id: 1, media_type: 'movie', title: 'こちら𠮷田' }],
        'こちら𠮷': [{ id: 2, media_type: 'tv', name: 'こちら𠮷田' }],
      }, requests),
    }, { query: 'こちら𠮷田' }));
    expect(results.map((item) => item.id)).toEqual(['tmdb-movie-1', 'tmdb-tv-2']);
  });

  test.each(['it', 'dune', 'x'.repeat(121)])('does not broaden short or oversized queries: %s', async (query) => {
    const requests: string[] = [];
    expect(await Effect.runPromise(searchTitlesFuzzy({
      token: 'test', fetch: searchFetch({}, requests),
    }, { query }))).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  test('empty or punctuation-only queries do not fetch', async () => {
    const requests: string[] = [];
    expect(await Effect.runPromise(searchTitlesFuzzy({
      token: 'test', fetch: searchFetch({}, requests),
    }, { query: '  ...  ' }))).toEqual([]);
    expect(requests).toHaveLength(0);
  });

  test('fallback failures preserve successful direct results', async () => {
    const requests: string[] = [];
    const results = await Effect.runPromise(searchTitlesFuzzy({
      token: 'test',
      fetch: searchFetch({
        interstelar: [{ id: 1, media_type: 'movie', title: 'Interstelar' }],
        interste: 500,
      }, requests),
    }, { query: 'interstelar' }));
    expect(results.map((item) => item.title)).toEqual(['Interstelar']);
    expect(requests).toHaveLength(2);
  });

  test('a primary failure surfaces without starting fallback requests', async () => {
    const requests: string[] = [];
    const error = await Effect.runPromise(Effect.flip(searchTitlesFuzzy({
      token: 'test', fetch: searchFetch({ interstelar: 401 }, requests),
    }, { query: 'interstelar' })));
    expect(error._tag).toBe('ProviderAuthError');
    expect(requests).toHaveLength(1);
  });

  test('cancellation aborts the supplemental fetch rather than swallowing interruption', async () => {
    const started = Promise.withResolvers<AbortSignal>();
    const controller = new AbortController();
    const pending = Effect.runPromise(searchTitlesFuzzy({
      token: 'test',
      fetch: (input, options) => {
        if (new URL(String(input)).searchParams.get('query') === 'matrx') {
          return Promise.resolve(Response.json({ results: [] }));
        }
        return new Promise<Response>((_resolve, reject) => {
          const signal = options?.signal as AbortSignal;
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          started.resolve(signal);
        });
      },
    }, { query: 'matrx' }), { signal: controller.signal });
    const signal = await started.promise;
    controller.abort();
    await expect(pending).rejects.toBeDefined();
    expect(signal.aborted).toBe(true);
  });
});
