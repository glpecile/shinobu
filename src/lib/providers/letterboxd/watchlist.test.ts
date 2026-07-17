import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { LetterboxdDeps } from './deps';
import {
  checkUsernameExists,
  getWatchlist,
  parseWatchlistPage,
} from './watchlist';

// Verbatim (whitespace-trimmed) LazyPoster component captured from a real
// watchlist page on 2026-07-15 — the attribute set the parser contracts on.
const TUNER_COMPONENT = `<div class="react-component" data-component-class="LazyPoster" data-request-poster-metadata="true" data-likeable="true" data-watchable="true" data-rateable="true" data-image-width="125" data-image-height="187" data-item-name="Tuner (2025)" data-item-slug="tuner" data-item-link="/film/tuner/" data-item-full-display-name="Tuner (2025)" data-postered-identifier='{&quot;lid&quot;:&quot;POtS&quot;,&quot;uid&quot;:&quot;film:1234878&quot;,&quot;type&quot;:&quot;film&quot;,&quot;typeName&quot;:&quot;film&quot;}' data-poster-url="/film/tuner/image-150/" data-resolvable-poster-path='{&quot;postered&quot;:{&quot;lid&quot;:&quot;POtS&quot;,&quot;uid&quot;:&quot;film:1234878&quot;,&quot;type&quot;:&quot;film&quot;,&quot;typeName&quot;:&quot;film&quot;},&quot;posteredBaseLink&quot;:&quot;/film/tuner/&quot;,&quot;isAdultThemed&quot;:false,&quot;hasDefaultPoster&quot;:true,&quot;cacheBustingKey&quot;:&quot;1e901a3e&quot;}' data-empty-poster-src="https://s.ltrbxd.com/static/img/empty-poster-125-AiuBHVCI.png" data-is-linked="true" data-target-link="/film/tuner/" data-details-endpoint="/film/tuner/json/" data-show-menu="true" >`;

// Entity-heavy title + a parenthetical inside the title itself.
const ENTITY_COMPONENT = `<div class="react-component" data-component-class="LazyPoster" data-item-name="What&#039;s Up, Doc? (Again) (1972)" data-item-slug="whats-up-doc" data-postered-identifier='{&quot;uid&quot;:&quot;film:51553&quot;}' data-resolvable-poster-path='{&quot;cacheBustingKey&quot;:&quot;abc123&quot;}' >`;

// No numeric id / cache key (defensive: attribute set shrank).
const BARE_COMPONENT = `<div class="react-component" data-component-class="LazyPoster" data-item-name="Slugless" data-item-slug="slugless" >`;

const PAGE = `<html><body><ul>
  <li class="griditem">${TUNER_COMPONENT}<div class="poster"><img alt="Tuner"/></div></div></li>
  <li class="griditem">${ENTITY_COMPONENT}</div></li>
  <li class="griditem">${BARE_COMPONENT}</div></li>
</ul></body></html>`;

describe('parseWatchlistPage', () => {
  test('extracts slug, title, year, film id, and cache key', () => {
    const films = parseWatchlistPage(PAGE);
    expect(films[0]).toEqual({
      slug: 'tuner',
      title: 'Tuner',
      year: 2025,
      filmId: 1234878,
      cacheBustingKey: '1e901a3e',
    });
  });

  test('decodes entities and anchors the year at the end of the name', () => {
    const films = parseWatchlistPage(PAGE);
    expect(films[1]).toEqual({
      slug: 'whats-up-doc',
      title: "What's Up, Doc? (Again)",
      year: 1972,
      filmId: 51553,
      cacheBustingKey: 'abc123',
    });
  });

  test('keeps films without a numeric id (no poster, no year)', () => {
    const films = parseWatchlistPage(PAGE);
    expect(films[2]).toEqual({ slug: 'slugless', title: 'Slugless' });
  });

  test('returns [] for a page with no film grid', () => {
    expect(parseWatchlistPage('<html><body>nothing here</body></html>')).toEqual([]);
  });
});

function depsRespondingWith(response: Response, username = 'gian'): LetterboxdDeps {
  return {
    username,
    fetch: async () => response,
  };
}

describe('getWatchlist', () => {
  test('normalizes the page into MOVIE items with constructed posters', async () => {
    const deps = depsRespondingWith(new Response(PAGE, { status: 200 }));
    const items = await Effect.runPromise(getWatchlist(deps));

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      id: 'letterboxd-tuner',
      title: 'Tuner',
      year: 2025,
      type: 'MOVIE',
      coverImage:
        'https://a.ltrbxd.com/resized/film-poster/1/2/3/4/8/7/8/1234878-tuner-0-600-0-900-crop.jpg?v=1e901a3e',
      externalIds: { letterboxd: 'tuner' },
    });
    expect(items[2].coverImage).toBe('');
  });

  test('fails with a dead-session auth error when no username is connected', async () => {
    const deps = depsRespondingWith(new Response('', { status: 200 }), '');
    deps.username = null;
    const outcome = await Effect.runPromise(Effect.either(getWatchlist(deps)));
    expect(outcome._tag).toBe('Left');
  });

  test('maps a 404 (renamed/deleted account) to a dead-session auth error', async () => {
    const deps = depsRespondingWith(new Response('', { status: 404 }));
    const outcome = await Effect.runPromise(Effect.flip(getWatchlist(deps)));
    expect(outcome._tag).toBe('ProviderAuthError');
  });
});

describe('checkUsernameExists', () => {
  test('200 → true, 404 → false', async () => {
    const yes = await Effect.runPromise(
      checkUsernameExists({ fetch: async () => new Response('', { status: 200 }) }, 'dave'),
    );
    const no = await Effect.runPromise(
      checkUsernameExists({ fetch: async () => new Response('', { status: 404 }) }, 'nobody'),
    );
    expect(yes).toBe(true);
    expect(no).toBe(false);
  });
});
