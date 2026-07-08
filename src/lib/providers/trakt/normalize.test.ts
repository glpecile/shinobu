import { describe, expect, test } from 'bun:test';

import {
  normalizeCastEntry,
  normalizeCrew,
  normalizeStudio,
  type TraktCastEntry,
  type TraktCrewEntry,
} from './normalize';

function person(id: number, name: string, headshot?: string) {
  return {
    name,
    ids: { trakt: id },
    ...(headshot != null ? { images: { headshot: [headshot] } } : {}),
  };
}

describe('normalizeCastEntry', () => {
  test('joins multiple characters and prefixes scheme-less headshots', () => {
    const entry: TraktCastEntry = {
      characters: ['Sherlock Holmes', 'Narrator'],
      person: person(42, 'Henry Cavill', 'walter.trakt.tv/people/42/headshot.jpg'),
    };

    expect(normalizeCastEntry(entry)).toEqual({
      id: 'trakt-person-42',
      name: 'Henry Cavill',
      character: 'Sherlock Holmes, Narrator',
      headshot: 'https://walter.trakt.tv/people/42/headshot.jpg',
    });
  });

  test('falls back to legacy singular `character` and empty headshot', () => {
    const entry: TraktCastEntry = {
      character: 'Enola',
      person: person(7, 'Millie Bobby Brown'),
    };

    const normalized = normalizeCastEntry(entry);
    expect(normalized.character).toBe('Enola');
    expect(normalized.headshot).toBe('');
  });
});

describe('normalizeCrew', () => {
  const director: TraktCrewEntry = {
    jobs: ['Director'],
    person: person(1, 'Harry Bradbeer'),
  };

  test('returns [] when crew is missing', () => {
    expect(normalizeCrew(undefined)).toEqual([]);
  });

  test('orders departments by billing, unknown departments last', () => {
    const crew = normalizeCrew({
      'made-up-department': [
        { jobs: ['Wrangler'], person: person(3, 'Zed Last') },
      ],
      editing: [{ jobs: ['Editor'], person: person(2, 'Adam Bosman') }],
      directing: [director],
    });

    expect(crew.map((member) => member.name)).toEqual([
      'Harry Bradbeer',
      'Adam Bosman',
      'Zed Last',
    ]);
  });

  test('merges one person credited across departments into a single entry', () => {
    const crew = normalizeCrew({
      directing: [director],
      writing: [
        { jobs: ['Writer', 'Director'], person: person(1, 'Harry Bradbeer') },
      ],
    });

    expect(crew).toHaveLength(1);
    expect(crew[0].job).toBe('Director, Writer');
  });

  test('supports legacy singular `job`', () => {
    const crew = normalizeCrew({
      camera: [{ job: 'Director of Photography', person: person(9, 'Giles Nuttgens') }],
    });

    expect(crew[0].job).toBe('Director of Photography');
  });
});

describe('normalizeStudio', () => {
  test('builds the combined id from the trakt id', () => {
    expect(normalizeStudio({ name: 'Legendary', ids: { trakt: 5 } })).toEqual({
      id: 'trakt-studio-5',
      name: 'Legendary',
    });
  });
});
