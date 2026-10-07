import { expect, test } from 'bun:test';
import { Effect } from 'effect';

import { getListFilmsPage, getListsPage } from './lists';

// Public page markup captured 2026-10-06, reduced to the read contract.
const POSTER = `<div data-component-class="LazyPoster" data-item-name="21 Grams (2003)" data-item-slug="21-grams" data-postered-identifier='{&quot;uid&quot;:&quot;film:51632&quot;}'></div>`;
const SUMMARY = `<div class="list-summary-list"><article class="list-summary js-list-summary js-list" data-person="jack">
  <a class="poster-list-link" href="/jack/list/classics/">${POSTER}</a>
  <h2 class="name prettify"><a href="/jack/list/classics/">Jack&#039;s <i>Classics</i> &amp; Favorites</a></h2>
  <span class="value">1,250&nbsp;films</span>
  <p><a href="/other/list/not-a-summary/">Description link</a></p>
</article></div>`;
const NEXT = '<div class="pagination"><a class="next" href="/jack/likes/lists/page/2/">Older</a></div>';
const FILMS = `<h1 class="title-1 prettify">Classics</h1><ul class="poster-list -p125 -grid">${POSTER}</ul>
  <aside><div data-component-class="LazyPoster" data-item-name="Not in this list" data-item-slug="sidebar"></div></aside>`;
const readList = (html: string) => getListFilmsPage({ fetch: async () => new Response(html) }, { owner: 'jack', slug: 'empty', page: 1 });

test('created and liked lists retain the creator, collection metadata and film previews', async () => {
  for (const [kind, page, path] of [
    ['created', 1, '/jack/lists/'],
    ['created', 2, '/jack/lists/page/2/'],
    ['liked', 1, '/jack/likes/lists/page/1/'],
  ] as const) {
    const result = await Effect.runPromise(getListsPage({ username: 'jack', fetch: async (url) => {
      expect(String(url)).toBe(`https://letterboxd.com${path}`);
      return new Response(SUMMARY + NEXT);
    } }, { kind, page }));
    expect(result.lists).toHaveLength(1);
    expect(result.lists[0]).toMatchObject({
      id: 'jack/classics', owner: 'jack', slug: 'classics', title: "Jack's Classics & Favorites", filmCount: 1250,
      previews: [{ id: 'letterboxd-21-grams', title: '21 Grams', year: 2003 }],
    });
    expect(result.hasNextPage).toBe(true);
  }
});

test('empty created and liked pages terminate, but unknown markup is an error', async () => {
  for (const [html, error] of [
    ['<span>No  lists yet</span>', false],
    ['<div class="list-summary-list"></div>', false],
    ['<html>Unrelated page</html>', true],
  ] as const) {
    const effect = getListsPage({ username: 'jack', fetch: async () => new Response(html) }, { kind: 'liked', page: 1 });
    if (error) expect((await Effect.runPromise(Effect.flip(effect)))._tag).toBe('ProviderDecodeError');
    else expect(await Effect.runPromise(effect)).toEqual({ lists: [], hasNextPage: false });
  }
});

test('list films exclude sidebar posters and end on the provider pagination signal', async () => {
  for (const [page, suffix, next] of [[1, '', NEXT], [2, 'page/2/', '']] as const) {
    const result = await Effect.runPromise(getListFilmsPage({ fetch: async (url) => {
      expect(String(url)).toBe(`https://letterboxd.com/jack/list/classics/${suffix}`);
      return new Response(FILMS + next);
    } }, { owner: 'jack', slug: 'classics', page }));
    expect(result.title).toBe('Classics');
    expect(result.items.map((film) => film.id)).toEqual(['letterboxd-21-grams']);
    expect(result.hasNextPage).toBe(page === 1);
  }
});

test('an empty list is valid, while a successful non-list response is not', async () => {
  expect(await Effect.runPromise(readList('<h1 class="title-1 prettify">Empty</h1>'))).toEqual({ title: 'Empty', items: [], hasNextPage: false });
  expect((await Effect.runPromise(Effect.flip(readList('<h1>Sign in</h1>'))))._tag).toBe('ProviderDecodeError');
});

test('unavailable and challenged pages fail rather than silently ending pagination', async () => {
  for (const [status, tag] of [[404, 'ProviderNetworkError'], [403, 'ProviderNetworkError'], [429, 'ProviderRateLimitError']] as const) {
    const result = await Effect.runPromise(Effect.flip(getListFilmsPage({ fetch: async () => new Response('', { status }) }, { owner: 'jack', slug: 'classics', page: 2 })));
    expect(result._tag).toBe(tag);
  }
});

test('malformed list addresses and page numbers never reach the network', async () => {
  const deps = { fetch: async () => { throw new Error('must not fetch'); } };
  for (const params of [
    { owner: '../film', slug: 'classics', page: 1 },
    { owner: 'jack', slug: 'classics/edit', page: 1 },
    { owner: 'jack', slug: 'classics', page: 0 },
    { owner: 'jack', slug: 'classics', page: 10000 },
  ]) expect((await Effect.runPromise(Effect.flip(getListFilmsPage(deps, params))))._tag).toBe('ProviderDecodeError');
  expect((await Effect.runPromise(Effect.flip(getListsPage({ ...deps, username: null }, { kind: 'created', page: 1 }))))._tag).toBe('ProviderAuthError');
});
