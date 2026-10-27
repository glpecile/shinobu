import { expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { LetterboxdDeps } from './deps';
import { getLetterboxdFilmWatch, resolveFilmSlug } from './watched';
import type { NormalizedMediaItem } from '@/types/media';

const item: NormalizedMediaItem = { id: 'letterboxd-vampire-hunter-d', title: 'Vampire Hunter D', type: 'MOVIE', coverImage: '', currentProgress: 0, progressUnit: 'episode', lastUpdated: '', externalIds: { letterboxd: 'vampire-hunter-d' } };
const viewing = '<body class="view" data-owner="Glp"><section class="film-viewing-info-wrapper"><h2><a href="/film/vampire-hunter-d/">Vampire Hunter D</a></h2></section>';
const deps = (html: string, status = 200): LetterboxdDeps => ({ username: 'glp', fetch: async () => new Response(html, { status }) });

test('a public member viewing records a watch even without a date or RSS entry', async () => {
  expect(await Effect.runPromise(getLetterboxdFilmWatch(deps(viewing), item))).toMatchObject({ externalIds: { letterboxd: 'vampire-hunter-d' }, currentProgress: 1 });
});

test('native resolves a slug from the manual redirect without downloading the film page', async () => {
  const init: RequestInit[] = [];
  const d = deps('');
  d.fetch = async (_url, options) => {
    init.push(options ?? {});
    return new Response(null, { status: 302, headers: { location: '/film/vampire-hunter-d/' } });
  };
  expect(await Effect.runPromise(resolveFilmSlug(d, 9463))).toBe('vampire-hunter-d');
  expect(init[0].redirect).toBe('manual');
});

test('the web proxy follows the redirect, so its page names the film through og:url', async () => {
  expect(await Effect.runPromise(resolveFilmSlug(deps('<meta property="og:url" content="https://letterboxd.com/film/vampire-hunter-d/">'), 9463))).toBe('vampire-hunter-d');
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
