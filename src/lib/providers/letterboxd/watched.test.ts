import { expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { LetterboxdDeps } from './deps';
import { getLetterboxdFilmWatch } from './watched';
import type { NormalizedMediaItem } from '@/types/media';

const item: NormalizedMediaItem = { id: 'letterboxd-vampire-hunter-d', title: 'Vampire Hunter D', type: 'MOVIE', coverImage: '', currentProgress: 0, progressUnit: 'episode', lastUpdated: '', externalIds: { letterboxd: 'vampire-hunter-d' } };
const viewing = '<body class="view" data-owner="Glp"><section class="film-viewing-info-wrapper"><h2><a href="/film/vampire-hunter-d/">Vampire Hunter D</a></h2></section>';
const deps = (html: string, status = 200): LetterboxdDeps => ({ username: 'glp', fetch: async () => new Response(html, { status }) });

test('a public member viewing records a watch even without a date or RSS entry', async () => {
  expect(await Effect.runPromise(getLetterboxdFilmWatch(deps(viewing), item))).toMatchObject({ externalIds: { letterboxd: 'vampire-hunter-d' }, currentProgress: 1 });
});

test('TMDB films use the exact redirect before the member viewing, not a title search', async () => {
  const calls: string[] = [];
  const d = deps(viewing);
  d.fetch = async (url) => {
    calls.push(String(url));
    return new Response(calls.length === 1 ? '<meta property="og:url" content="https://letterboxd.com/film/vampire-hunter-d/">' : viewing);
  };
  await Effect.runPromise(getLetterboxdFilmWatch(d, { ...item, externalIds: { tmdb: 9463 } }));
  expect(calls).toEqual(['https://letterboxd.com/tmdb/9463/', 'https://letterboxd.com/glp/film/vampire-hunter-d/']);
});

test('a followed TMDB redirect names the film without reading its page', async () => {
  const redirect = new Response(null);
  Object.defineProperty(redirect, 'url', { value: 'https://letterboxd.com/film/vampire-hunter-d/' });
  redirect.text = async () => { throw new Error('must not read the redirected page'); };
  const d = deps(viewing);
  d.fetch = async (url) => String(url).includes('/tmdb/') ? redirect : new Response(viewing);
  expect(await Effect.runPromise(getLetterboxdFilmWatch(d, { ...item, externalIds: { tmdb: 9463 } }))).toMatchObject({ externalIds: { letterboxd: 'vampire-hunter-d' } });
});

test('an absent public viewing supplies no positive watch evidence', async () => {
  expect(await Effect.runPromise(getLetterboxdFilmWatch(deps('', 404), item))).toBeNull();
});

test.each([viewing.replace('Glp', 'someone-else'), viewing.replace('/film/vampire-hunter-d/', '/film/wrong-film/'), '<html>Just a moment...</html>'])('untrusted or mismatched pages cannot light the watched eye', async (html) => {
  expect((await Effect.runPromise(Effect.flip(getLetterboxdFilmWatch(deps(html), item))))._tag).toBe('ProviderDecodeError');
});

test('unsafe identities stop before a request', async () => {
  const d = deps('');
  d.fetch = async () => { throw new Error('must not fetch'); };
  expect((await Effect.runPromise(Effect.flip(getLetterboxdFilmWatch(d, { ...item, externalIds: { letterboxd: '../sign-in' } }))))._tag).toBe('ProviderDecodeError');
});
