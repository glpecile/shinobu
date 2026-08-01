import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { HttpFetch } from '@/lib/http/types';
import { namesMatch, pickPersonMatch } from '@/lib/providers/tmdb/normalize';

import { searchAniListStaff, searchAniListStudio } from './reads';

/**
 * Plan 0035 U4. The resolution behind "Open in AniList": a name search whose
 * result the house matcher has to *confirm*, because the alternative — the
 * previous `?search={name}` URL — sent most TMDB people to an empty search page.
 *
 * The reads normalize; the accept/reject rule is asserted here against the same
 * `pickPersonMatch` + `namesMatch` pair `state/queries/anilist.ts` applies, so
 * the rule is checkable without a query client or a renderer.
 */

function mockFetch(response: unknown): HttpFetch {
  return async () =>
    ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => response,
    }) as Awaited<ReturnType<HttpFetch>>;
}

const DEPS = {
  fetch: mockFetch({}),
  tokens: { get: () => null, set: () => {}, clear: () => {} },
};

describe('searchAniListStaff', () => {
  test('normalizes a page of hits to { id, name }', async () => {
    const fetch = mockFetch({
      data: {
        Page: {
          staff: [
            { id: 96_879, name: { full: 'Hayao Miyazaki', native: '宮崎駿' } },
            // No romanization — the native name still identifies the page.
            { id: 12, name: { full: null, native: '新海誠' } },
          ],
        },
      },
    });

    await expect(
      Effect.runPromise(
        searchAniListStaff({ ...DEPS, fetch }, { name: 'Hayao Miyazaki' }),
      ),
    ).resolves.toEqual([
      { id: 96_879, name: 'Hayao Miyazaki' },
      { id: 12, name: '新海誠' },
    ]);
  });

  test('drops hits with no id or no name at all — neither can build a link', async () => {
    const fetch = mockFetch({
      data: {
        Page: {
          staff: [
            null,
            { id: null, name: { full: 'Nameless Id' } },
            { id: 5, name: { full: '', native: null } },
            { id: 7, name: { full: 'Keeper' } },
          ],
        },
      },
    });

    await expect(
      Effect.runPromise(searchAniListStaff({ ...DEPS, fetch }, { name: 'x' })),
    ).resolves.toEqual([{ id: 7, name: 'Keeper' }]);
  });

  test('an empty page is an empty list, not a failure', async () => {
    const fetch = mockFetch({ data: { Page: { staff: [] } } });
    await expect(
      Effect.runPromise(searchAniListStaff({ ...DEPS, fetch }, { name: 'x' })),
    ).resolves.toEqual([]);

    const missing = mockFetch({ data: { Page: null } });
    await expect(
      Effect.runPromise(
        searchAniListStaff({ ...DEPS, fetch: missing }, { name: 'x' }),
      ),
    ).resolves.toEqual([]);
  });
});

describe('searchAniListStudio', () => {
  test('normalizes the flatter studio payload the same way', async () => {
    const fetch = mockFetch({
      data: {
        Page: {
          studios: [
            { id: 21, name: 'Studio Ghibli' },
            { id: 22, name: null },
            null,
          ],
        },
      },
    });

    await expect(
      Effect.runPromise(
        searchAniListStudio({ ...DEPS, fetch }, { name: 'Studio Ghibli' }),
      ),
    ).resolves.toEqual([{ id: 21, name: 'Studio Ghibli' }]);
  });
});

/**
 * R13, the rule that decides whether a pill renders at all. `pickPersonMatch`
 * ends in a fuzzy "take the top hit" fallback, which is right for the lookup
 * routes (they show the user what they found) and wrong for a link that opens a
 * page silently. `namesMatch` is that fallback's veto.
 */
function resolve(hits: { id: number; name: string }[], query: string) {
  const match = pickPersonMatch(hits, query);
  return match != null && namesMatch(match.name, query) ? match.id : null;
}

describe('the resolution rule: confident match or nothing', () => {
  test('an exact name resolves its id even from a crowded page', () => {
    expect(
      resolve(
        [
          { id: 1, name: 'Hayao Miyazaki Jr.' },
          { id: 96_879, name: 'Hayao Miyazaki' },
        ],
        'Hayao Miyazaki',
      ),
    ).toBe(96_879);
  });

  test('a family-name-first romanization still resolves', () => {
    // AniList writes "Kaji Yuki", TMDB writes "Yuki Kaji" — the same person.
    expect(resolve([{ id: 118_320, name: 'Kaji Yuki' }], 'Yuki Kaji')).toBe(118_320);
  });

  test('diacritics fold rather than block a match', () => {
    expect(resolve([{ id: 3, name: 'Jose Gonzalez' }], 'José González')).toBe(3);
  });

  test('a near-name never resolves — this is the whole point (R13)', () => {
    // What the old search URL papered over: the actor is simply not on AniList,
    // and the top hit is somebody else. No id means no pill.
    expect(
      resolve([{ id: 999, name: 'Timothy Chalamet-Adjacent' }], 'Timothée Chalamet'),
    ).toBeNull();
  });

  test('an empty page resolves to nothing', () => {
    expect(resolve([], 'Anyone At All')).toBeNull();
  });
});
