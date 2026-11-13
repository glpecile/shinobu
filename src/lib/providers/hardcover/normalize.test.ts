import { describe, expect, test } from 'bun:test';

import { localDayKey } from '@/features/diary/merge';

import {
  normalizeHardcoverBook,
  normalizeHardcoverJournal,
  normalizeHardcoverLibraryRow,
} from './normalize';

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

describe('normalizeHardcoverLibraryRow', () => {
  const row = {
    status_id: 2,
    created_at: '2026-11-01T10:00:00.123456+00:00',
    updated_at: '2026-11-10T21:30:00.654321+00:00',
    book: { id: 61, title: 'No Longer Human', pages: 176 },
  };

  test('a read in progress carries its pages and its edition total', () => {
    const entry = normalizeHardcoverLibraryRow({
      ...row,
      edition: { pages: 200 },
      user_book_reads: [{ progress_pages: 142, edition: { pages: 380 } }],
    });

    expect(entry).toMatchObject({
      statusId: 2,
      addedAt: '2026-11-01T10:00:00.123Z',
      item: { currentProgress: 142, totalEpisodes: 380, lastUpdated: '2026-11-10T21:30:00.654Z' },
    });
  });

  test('an audiobook read shows no page progress and no page total', () => {
    const entry = normalizeHardcoverLibraryRow({
      ...row,
      user_book_reads: [{ progress_seconds: 5400, edition: {} }],
    });

    expect(entry?.item.currentProgress).toBe(0);
    expect(entry?.item).not.toContainKey('totalEpisodes');
  });

  test('a Want to Read book takes the entry edition total', () => {
    const entry = normalizeHardcoverLibraryRow({
      ...row,
      status_id: 1,
      updated_at: undefined,
      edition: { pages: 200 },
      user_book_reads: [],
    });

    expect(entry).toMatchObject({
      statusId: 1,
      item: { currentProgress: 0, totalEpisodes: 200, lastUpdated: '2026-11-01T10:00:00.123Z' },
    });
  });
});

describe('normalizeHardcoverJournal', () => {
  const book = { id: 61, title: 'No Longer Human' };

  // Midnight UTC on 9 March is still the 8th in Buenos Aires. The reader's day is the 9th.
  test('a journal date stays the reader day in every time zone', () => {
    const entry = normalizeHardcoverJournal({
      id: '501',
      event: 'status_read',
      action_at: '2026-03-09T00:00:00+00:00',
      journal_date: '2026-03-09',
      book,
    });

    expect(entry).toMatchObject({ id: 'hardcover-501', dateOnly: true, readingEvent: 'finished' });
    for (const zone of ['America/Argentina/Buenos_Aires', 'Asia/Tokyo']) {
      expect(localDayKey(entry!, zone)).toBe('2026-03-09');
    }
  });

  test('without a journal date the event instant places the entry', () => {
    const entry = normalizeHardcoverJournal({
      id: 502,
      event: 'status_currently_reading',
      action_at: '2026-03-09T00:00:00+00:00',
      book,
    });

    expect(entry).toMatchObject({ watchedAt: '2026-03-09T00:00:00.000Z', readingEvent: 'started' });
    expect(entry).not.toContainKey('dateOnly');
  });
});
