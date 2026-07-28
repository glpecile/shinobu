import { describe, expect, test } from 'bun:test';

import { manualRowsFor } from '@/features/log-media/manual-write-links';
import type { ProviderWriteOutcome } from '@/features/log-media/fan-out';
import { splitWriteTargets } from '@/lib/providers/routing';
import type { NormalizedMediaItem } from '@/types/media';

import {
  addedToSentence,
  alreadyOnSentence,
  failedOnSentence,
  isCleanWatchlistReport,
  watchlistCtaCopy,
  watchlistResultView,
  type WatchlistReportLike,
} from './copy';

const FILM: NormalizedMediaItem = {
  id: 'trakt-1',
  title: 'A Film',
  coverImage: '',
  type: 'MOVIE',
  currentProgress: 0,
  progressUnit: 'episode',
  lastUpdated: '2026-07-27T00:00:00.000Z',
  year: 1997,
  externalIds: { trakt: 1, tmdb: 77, letterboxd: 'a-film' },
};

const MANGA: NormalizedMediaItem = {
  ...FILM,
  id: 'anilist-5',
  title: 'A Manga',
  type: 'MANGA',
  progressUnit: 'chapter',
  externalIds: { anilist: 5 },
};

function report(
  outcomes: readonly ProviderWriteOutcome[],
  manual: WatchlistReportLike['manual'] = [],
): WatchlistReportLike {
  return {
    succeeded: outcomes.filter((o) => o.status === 'ok').map((o) => o.provider),
    failed: outcomes.filter((o) => o.status === 'error').map((o) => o.provider),
    outcomes,
    manual,
  };
}

describe('watchlistCtaCopy (plan 0031 R14)', () => {
  test('watch-intent items read "Add to watchlist" → "On your watchlist"', () => {
    const copy = watchlistCtaCopy(FILM);
    expect(copy.idle).toBe('Add to watchlist');
    expect(copy.settled).toBe('On your watchlist');
  });

  test('read-intent items say reading list instead', () => {
    const copy = watchlistCtaCopy(MANGA);
    expect(copy.idle).toBe('Add to reading list');
    expect(copy.settled).toBe('On your reading list');
  });

  test('no label names a provider or a mechanism', () => {
    const banned = [
      'trakt',
      'anilist',
      'letterboxd',
      'serializd',
      'fan out',
      'fan-out',
      'sync',
    ];
    for (const item of [FILM, MANGA]) {
      const copy = watchlistCtaCopy(item);
      for (const label of [copy.idle, copy.settled, copy.pending]) {
        for (const word of banned) {
          expect(label.toLowerCase()).not.toContain(word);
        }
      }
    }
  });
});

describe('watchlistResultView settled condition (plan 0031 R14)', () => {
  test('an all-ok report settles the label', () => {
    const view = watchlistResultView(
      report([
        { provider: 'trakt', status: 'ok' },
        { provider: 'anilist', status: 'ok' },
      ]),
      FILM,
    );
    expect(view.settled).toBe(true);
    expect(view.allSkip).toBe(false);
    expect(addedToSentence(view.succeeded)).toBe('Added to Trakt, AniList.');
  });

  test('an already-there skip settles it exactly like a success', () => {
    const view = watchlistResultView(
      report([
        { provider: 'trakt', status: 'skipped', reason: 'already on your watchlist' },
      ]),
      FILM,
    );
    expect(view.settled).toBe(true);
    expect(view.allSkip).toBe(true);
    expect(alreadyOnSentence(view.reasonedSkips)).toBe('Already on Trakt.');
  });

  test('a mixed report does not settle it, and names the failure', () => {
    const view = watchlistResultView(
      report([
        { provider: 'trakt', status: 'ok' },
        { provider: 'anilist', status: 'error', message: 'token expired' },
      ]),
      FILM,
    );
    expect(view.settled).toBe(false);
    expect(failedOnSentence(view.failed)).toBe('Failed on AniList.');
  });

  test('a reason-less skip alone does not settle it', () => {
    const view = watchlistResultView(
      report([{ provider: 'trakt', status: 'skipped' }]),
      FILM,
    );
    expect(view.settled).toBe(false);
    expect(view.reasonedSkips).toEqual([]);
    expect(view.allSkip).toBe(false);
  });
});

describe('the three result families (plan 0031 KTD-8/R17)', () => {
  test('every reasoned skip is its own line, never lumped', () => {
    const view = watchlistResultView(
      report([
        { provider: 'trakt', status: 'skipped', reason: 'already on your watchlist' },
        { provider: 'anilist', status: 'skipped', reason: 'already watching' },
      ]),
      FILM,
    );
    expect(view.reasonedSkips.map((skip) => skip.provider)).toEqual([
      'trakt',
      'anilist',
    ]);
    expect(view.reasonedSkips.map((skip) => skip.reason)).toEqual([
      'already on your watchlist',
      'already watching',
    ]);
    // The all-skip report renders as *something*: this is the most common
    // repeat interaction, and the log button's copy (a suffix to a success
    // line that isn't there) would render nothing at all.
    expect(view.allSkip).toBe(true);
    expect(alreadyOnSentence(view.reasonedSkips)).toBe(
      'Already on Trakt, AniList.',
    );
  });

  test('failed outcomes carry their own "Add on" link targets', () => {
    const view = watchlistResultView(
      report([{ provider: 'letterboxd', status: 'error', message: 'nope' }]),
      FILM,
    );
    expect(view.errorLinks.map((link) => link.provider)).toEqual(['letterboxd']);
    expect(view.errorLinks[0]?.url).toContain('letterboxd.com');
  });

  test('on web a film offers Letterboxd as an upfront manual row', () => {
    const { writable, manual } = splitWriteTargets(
      FILM,
      ['trakt', 'letterboxd'],
      'web',
      'watchlist',
    );
    expect(writable).toEqual(['trakt']);
    expect(manual).toEqual(['letterboxd']);
    // Rendered before any tap: excluded from the fan-out, it produces no
    // outcome at all, so without this row it would render nothing.
    const rows = manualRowsFor(manual, FILM);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe('letterboxd');
    expect(rows[0]?.url).toContain('letterboxd.com');
  });

  test('Serializd is a manual row on native too, until U9 flips it', () => {
    const show: NormalizedMediaItem = {
      ...FILM,
      type: 'TV',
      externalIds: { trakt: 1, tmdb: 77 },
    };
    const { writable, manual } = splitWriteTargets(
      show,
      ['trakt', 'serializd'],
      'ios',
      'watchlist',
    );
    expect(writable).toEqual(['trakt']);
    expect(manual).toEqual(['serializd']);
  });
});

describe('isCleanWatchlistReport (the sheet close gate)', () => {
  test('all ok with no manual rows closes the sheet', () => {
    expect(isCleanWatchlistReport(report([{ provider: 'trakt', status: 'ok' }]))).toBe(
      true,
    );
  });

  test('a failure keeps it open', () => {
    expect(
      isCleanWatchlistReport(
        report([
          { provider: 'trakt', status: 'ok' },
          { provider: 'anilist', status: 'error', message: 'nope' },
        ]),
      ),
    ).toBe(false);
  });

  test('a reasoned skip keeps it open', () => {
    expect(
      isCleanWatchlistReport(
        report([
          { provider: 'trakt', status: 'ok' },
          { provider: 'anilist', status: 'skipped', reason: 'already watching' },
        ]),
      ),
    ).toBe(false);
  });

  test('an outstanding manual row keeps it open', () => {
    expect(
      isCleanWatchlistReport(
        report([{ provider: 'trakt', status: 'ok' }], ['letterboxd']),
      ),
    ).toBe(false);
  });
});
