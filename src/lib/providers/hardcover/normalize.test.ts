import { describe, expect, test } from 'bun:test';

import { normalizeHardcoverBook } from './normalize';

const NOW = '2026-11-12T12:00:00.000Z';

describe('normalizeHardcoverBook', () => {
  test('a full book carries its cover, pages, description and rating', () => {
    expect(
      normalizeHardcoverBook(
        {
          id: 1203,
          title: "God's Junk Drawer",
          description: 'A drawer full of strange things.',
          pages: 352,
          release_year: 2025,
          rating: 4.1,
          ratings_count: 87,
          image: { url: 'https://assets.hardcover.app/gjd.jpg' },
        },
        NOW,
      ),
    ).toEqual({
      id: 'hardcover-1203',
      title: "God's Junk Drawer",
      coverImage: 'https://assets.hardcover.app/gjd.jpg',
      overview: 'A drawer full of strange things.',
      year: 2025,
      ratings: [{ source: 'hardcover', value: 4.1, scale: 5, votes: 87 }],
      type: 'BOOK',
      currentProgress: 0,
      progressUnit: 'page',
      totalEpisodes: 352,
      lastUpdated: NOW,
      externalIds: { hardcover: 1203 },
    });
  });

  // An audiobook-only book has no pages; Hardcover also stores 0 and blank text.
  test('missing cover, pages, description and rating leave no field behind', () => {
    const item = normalizeHardcoverBook(
      { id: 77, title: 'No Longer Human', description: '  ', pages: 0, rating: 0, image: {} },
      NOW,
    );

    expect(item.coverImage).toBe('');
    expect(item).not.toContainKeys(['overview', 'totalEpisodes', 'ratings', 'year']);
  });
});
