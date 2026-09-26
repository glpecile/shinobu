import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { HttpFetch } from '@/lib/http/types';
import { getAniListStaff, searchAniListStaff, searchAniListStudio } from './reads';

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

test('staff biographies retain link targets for display and plain text for metadata', async () => {
  const fetch = mockFetch({
    data: {
      Staff: {
        id: 19,
        name: { full: 'Baku Kinoshita' },
        description: '[Website](https://example.com) | [Twitter](https://x.com/baku)<br><br>An animator.',
      },
    },
  });

  const { person } = await Effect.runPromise(
    getAniListStaff({ ...DEPS, fetch }, { id: 19 }),
  );
  expect(person.biography).toBe('Website | Twitter\n\nAn animator.');
  expect(person.biographyMarkdown).toBe(
    '[Website](https://example.com) | [Twitter](https://x.com/baku)\n\nAn animator.',
  );
});

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
