import { expect, test } from 'bun:test';
import * as Effect from 'effect/Effect';

import { createList, getListFilmsPage, getListsPage, setListLiked, setListMembership } from './lists';

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
  for (const [owner, username, session, tag] of [
    ['../settings', 'gian', { cookie: 'session', csrf: 'csrf' }, 'ProviderDecodeError'],
    ['gian', 'gian', { cookie: 'session', csrf: 'csrf' }, 'ProviderDecodeError'],
    ['jack', 'gian', null, 'ProviderAuthError'],
    ['jack', null, { cookie: 'session', csrf: 'csrf' }, 'ProviderAuthError'],
  ] as const) {
    let writes = 0;
    const effect = setListLiked({ ...deps, username, session, listLikeWebFetch: async () => { writes += 1; return { status: 200, body: '{"result":true,"liked":true}' }; } }, { owner, slug: 'classics', liked: true });
    expect((await Effect.runPromise(Effect.flip(effect)))._tag).toBe(tag);
    expect(writes).toBe(0);
  }
});

test('list likes acknowledge only the requested state, through either authenticated transport', async () => {
  for (const liked of [true, false]) {
    for (const userscript of [true, false]) {
      const transport = async (request: { listPath: string; username: string; liked: boolean }) => {
        expect(request).toEqual({ listPath: '/jack/list/classics/', username: 'gian', liked });
        return { status: 200, body: JSON.stringify({ result: true, liked }) };
      };
      expect(await Effect.runPromise(setListLiked({ fetch: async () => { throw new Error('must not use public fetch'); }, username: 'gian', ...(userscript ? { userscriptListLikeFetch: transport } : { session: { cookie: 'session', csrf: 'csrf' }, listLikeWebFetch: transport }) }, { owner: 'jack', slug: 'classics', liked }))).toBe(liked);
    }
  }
});

test.each([
  [200, '{"result":false,"liked":true}', 'ProviderDecodeError'],
  [200, '{"result":true,"liked":false}', 'ProviderDecodeError'],
  [200, '<html>Sign in</html>', 'ProviderDecodeError'],
  [401, '', 'ProviderAuthError'],
  [429, '', 'ProviderRateLimitError'],
  [0, 'Verification required', 'ProviderDecodeError'],
  [500, '', 'ProviderDecodeError'],
] as const)('list likes reject unconfirmed receipts (%s %s)', async (status, body, tag) => {
  const effect = setListLiked({ fetch: async () => new Response(), username: 'gian', userscriptListLikeFetch: async () => ({ status, body }) }, { owner: 'jack', slug: 'classics', liked: true });
  expect((await Effect.runPromise(Effect.flip(effect)))._tag).toBe(tag);
});

test('membership changes require ownership and acknowledge only the requested state', async () => {
  const item = { id: 'tmdb-movie-550', title: 'Fight Club', coverImage: '', type: 'MOVIE' as const, currentProgress: 0, progressUnit: 'episode' as const, lastUpdated: '', externalIds: { tmdb: 550 } };
  for (const present of [true, false]) {
    let writes = 0;
    const deps = { username: 'Gian', fetch: async () => new Response(), listMembershipFetch: async (request: { username: string; listPath: string; filmPath: string; present: boolean }) => {
      writes += 1;
      expect(request).toEqual({ username: 'Gian', listPath: '/gian/list/classics/', filmPath: '/tmdb/550/', present });
      return { status: 200, body: JSON.stringify({ result: true, present, filmSlug: 'fight-club' }) };
    } };
    const params = { owner: 'gian', slug: 'classics', item, present };
    expect(await Effect.runPromise(setListMembership(deps, params))).toMatchObject({ present, filmSlug: 'fight-club' });
    expect((await Effect.runPromise(Effect.flip(setListMembership(deps, { ...params, owner: 'jack' }))))._tag).toBe('ProviderAuthError');
    expect(writes).toBe(1);
    const rejected = { ...deps, listMembershipFetch: async () => ({ status: 200, body: JSON.stringify({ result: true, present: !present, filmSlug: 'fight-club' }) }) };
    expect((await Effect.runPromise(Effect.flip(setListMembership(rejected, params))))._tag).toBe('ProviderDecodeError');
    for (const body of ['Letterboxd needs verification.', '{"message":"Letterboxd needs verification."}']) {
      const failure = await Effect.runPromise(Effect.flip(setListMembership({ ...deps, listMembershipFetch: async () => ({ status: 0, body }) }, params)));
      expect(failure).toMatchObject({ _tag: 'ProviderDecodeError', detail: 'Letterboxd needs verification.' });
    }
  }
});

test('creation sends films only and accepts a receipt for a list the account owns', async () => {
  const film = { id: 'tmdb-movie-550', title: 'Fight Club', coverImage: '', type: 'MOVIE' as const, currentProgress: 0, progressUnit: 'episode' as const, lastUpdated: '', externalIds: { tmdb: 550 } };
  const draft = { name: ' Classics ', description: '', tags: ['top 10'], sharing: 'Friends' as const, ranked: true, items: [film] };
  for (const [listPath, created] of [['/gian/list/classics/', true], ['/jack/list/classics/', false]] as const) {
    const deps = { username: 'Gian', fetch: async () => new Response(), listCreateFetch: async (request: unknown) => {
      expect(request).toEqual({ username: 'Gian', name: 'Classics', description: '', tags: ['top 10'], sharing: 'Friends', ranked: true, filmPaths: ['/tmdb/550/'] });
      return { status: 200, body: JSON.stringify({ result: true, listPath }) };
    } };
    if (created) expect(await Effect.runPromise(createList(deps, draft))).toEqual({ owner: 'gian', slug: 'classics' });
    else expect((await Effect.runPromise(Effect.flip(createList(deps, draft))))._tag).toBe('ProviderDecodeError');
  }
  const unused = { username: 'gian', fetch: async () => new Response(), listCreateFetch: async () => { throw new Error('unexpected write'); } };
  expect((await Effect.runPromise(Effect.flip(createList(unused, { ...draft, items: [{ ...film, type: 'TV' as const }] }))))._tag).toBe('ProviderDecodeError');
});
