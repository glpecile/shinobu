import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { HttpFetch } from '@/lib/http/types';
import { getPersonByName } from './person-details';

/** Routes by URL: TMDB requests carry a path, AniList is one POST endpoint. */
function mockFetch(
  respond: (url: string, body: unknown) => unknown,
): HttpFetch {
  return async (url, init) =>
    ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () =>
        respond(
          String(url),
          init?.body == null ? null : JSON.parse(String(init.body)),
        ),
    }) as Awaited<ReturnType<HttpFetch>>;
}

const ANILIST_STAFF = {
  id: 386738,
  name: { full: 'Hoshigaki' },
  image: { large: 'https://img/hoshigaki.jpg' },
  description: 'A composer.<br>Second line.',
  dateOfBirth: { year: 1990, month: 3, day: 4 },
  primaryOccupations: ['Musician'],
  characterMedia: { edges: [] },
  staffMedia: {
    edges: [
      {
        staffRole: 'Theme Song Performance (OP)',
        node: { id: 1, type: 'ANIME', title: { romaji: 'Devils Crest' }, seasonYear: 2026 },
      },
    ],
  },
};

function deps(respond: (url: string, body: unknown) => unknown) {
  const fetch = mockFetch(respond);
  return {
    tmdb: { fetch, token: 'tmdb-token' },
    anilist: { fetch, tokens: { get: () => null, set: () => {}, clear: () => {} } },
  };
}

describe('getPersonByName', () => {
  test('falls over to AniList staff when TMDB has no one by that name', async () => {
    const details = await Effect.runPromise(
      getPersonByName(
        deps((url) =>
          url.includes('themoviedb')
            ? { results: [] }
            : { data: { Page: { staff: [{ id: 386738, name: { full: 'Hoshigaki' } }] }, Staff: ANILIST_STAFF } },
        ),
        { name: 'Hoshigaki' },
      ),
    );

    expect(details?.person.anilistId).toBe(386738);
    expect(details?.person.tmdbId).toBeUndefined();
    expect(details?.person.biography).toBe('A composer.\nSecond line.');
    expect(details?.person.birthday).toBe('1990-03-04');
    expect(details?.rows[0]?.role).toBe('Musician');
    expect(details?.rows[0]?.details['anilist-1']).toBe(
      '2026 · Theme Song Performance (OP)',
    );
  });

  test('prefers TMDB when it has a match, without touching AniList', async () => {
    let anilistCalls = 0;
    const details = await Effect.runPromise(
      getPersonByName(
        deps((url) => {
          if (!url.includes('themoviedb')) {
            anilistCalls += 1;
            return { data: { Page: { staff: [] } } };
          }
          return url.includes('/search/person')
            ? { results: [{ id: 42, name: 'Yuki Kaji' }] }
            : { id: 42, name: 'Yuki Kaji', known_for_department: 'Acting' };
        }),
        { name: 'Yuki Kaji' },
      ),
    );

    expect(details?.person.tmdbId).toBe(42);
    expect(anilistCalls).toBe(0);
  });

  test('is null when neither provider knows the name', async () => {
    const details = await Effect.runPromise(
      getPersonByName(
        deps((url) =>
          url.includes('themoviedb')
            ? { results: [] }
            : { data: { Page: { staff: [] } } },
        ),
        { name: 'Nobody At All' },
      ),
    );

    expect(details).toBeNull();
  });
});
