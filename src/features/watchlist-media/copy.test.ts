import { describe, expect, test } from 'bun:test';

import type { ProviderWriteOutcome } from '@/features/log-media/fan-out';
import type { NormalizedMediaItem } from '@/types/media';

import {
  addedToastTitle,
  addedToSentence,
  removalLine,
  failedOnSentence,
  isUnwatchlistCtaSettled,
  isWatchlistCtaSettled,
  removedFromSentence,
  removedToastTitle,
  unwatchlistConfirmLabel,
  unwatchlistCtaCopy,
  watchlistConfirmLabel,
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

function report(outcomes: readonly ProviderWriteOutcome[]): WatchlistReportLike {
  return {
    succeeded: outcomes.filter((o) => o.status === 'ok').map((o) => o.provider),
    failed: outcomes.filter((o) => o.status === 'error').map((o) => o.provider),
    outcomes,
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

});

describe('watchlistResultView report families (plan 0031 R14)', () => {
  test('an all-ok report names what took it', () => {
    const view = watchlistResultView(
      report([
        { provider: 'trakt', status: 'ok' },
        { provider: 'anilist', status: 'ok' },
      ]),
      FILM,
    );
    expect(view.allSkip).toBe(false);
    expect(addedToSentence(view.succeeded)).toBe('Added to Trakt, AniList.');
  });

  test('a mixed report names the failure', () => {
    const view = watchlistResultView(
      report([
        { provider: 'trakt', status: 'ok' },
        { provider: 'anilist', status: 'error', message: 'token expired' },
      ]),
      FILM,
    );
    expect(failedOnSentence(view.failed)).toBe('Failed on AniList.');
  });

  test('a reason-less skip contributes no line at all', () => {
    const view = watchlistResultView(
      report([{ provider: 'trakt', status: 'skipped' }]),
      FILM,
    );
    expect(view.reasonedSkips).toEqual([]);
    expect(view.allSkip).toBe(false);
  });
});

describe('isWatchlistCtaSettled (plan 0031 U15, R14, KTD-14)', () => {
  test('a known-watchlisted item settles on first mount, with no report', () => {
    // The app-restart / other-device / added-on-the-website case the old
    // mutation-derived condition could never answer: no write ever fired here.
    expect(isWatchlistCtaSettled(true, null)).toBe(true);
  });

  test('a cold cache renders the unsettled label, never a claim of absence', () => {
    expect(isWatchlistCtaSettled(undefined, null)).toBe(false);
  });

  test('a mixed report keeps the CTA actionable even once membership is known', () => {
    const view = watchlistResultView(
      report([
        { provider: 'trakt', status: 'ok' },
        { provider: 'anilist', status: 'error', message: 'token expired' },
      ]),
      FILM,
    );
    expect(isWatchlistCtaSettled(true, view)).toBe(false);
  });

  test('on one watchlist but missing from another is not settled', () => {
    // Owner report 2026-08-01: a film left on the Letterboxd watchlist after a
    // Simkl-only removal is "on a watchlist" and still has an add to offer.
    expect(isWatchlistCtaSettled(true, null, true)).toBe(false);
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
  });

});

describe('isUnwatchlistCtaSettled (plan 0031 U16, R35)', () => {
  const clean = watchlistResultView(report([{ provider: 'trakt', status: 'ok' }]), FILM);

  test('a cold cache never renders "Removed" for something nobody removed', () => {
    // No report at all: `onList: false` on its own is the state of every item
    // the user has never watchlisted.
    expect(isUnwatchlistCtaSettled(false, null, [])).toBe(false);
  });

  test('settles once the refetch lands and every membership was known', () => {
    expect(isUnwatchlistCtaSettled(false, clean, [])).toBe(true);
    // Still on a watchlist — the removal has not landed yet.
    expect(isUnwatchlistCtaSettled(true, clean, [])).toBe(false);
    // Surface never opened: unknown is never a claim of absence (R31).
    expect(isUnwatchlistCtaSettled(undefined, clean, [])).toBe(false);
  });

  test('one unknown membership withholds it, however clean the report', () => {
    expect(isUnwatchlistCtaSettled(false, clean, ['serializd'])).toBe(false);
  });

  test('a failure withholds it too — the CTA doubles as the retry', () => {
    const mixed = watchlistResultView(
      report([
        { provider: 'trakt', status: 'ok' },
        { provider: 'anilist', status: 'error', message: 'nope' },
      ]),
      FILM,
    );
    expect(isUnwatchlistCtaSettled(false, mixed, [])).toBe(false);
  });
});

describe('unwatchlistCtaCopy and its result headline (R38)', () => {
  test('"Remove from watchlist" morphs to "Removed", with no provider named', () => {
    expect(unwatchlistCtaCopy(FILM)).toEqual({
      idle: 'Remove from watchlist',
      settled: 'Removed',
      pending: 'Removing…',
    });
  });

  test('read-intent items say reading list instead', () => {
    expect(unwatchlistCtaCopy(MANGA).idle).toBe('Remove from reading list');
  });

  test('the success headline is the one place providers are named', () => {
    expect(removedFromSentence(['trakt', 'anilist'])).toBe('Removed from Trakt, AniList.');
  });
});

describe('picker confirm labels and toast titles (plan 0032 R3)', () => {
  const film = { type: 'MOVIE' } as const;
  const manga = { type: 'MANGA' } as const;

  test('the confirm label counts lists, never names a provider', () => {
    expect(watchlistConfirmLabel(film, 1)).toBe('Add to watchlist');
    expect(watchlistConfirmLabel(film, 2)).toBe('Add to 2 watchlists');
    expect(watchlistConfirmLabel(manga, 1)).toBe('Add to reading list');
    expect(unwatchlistConfirmLabel(film, 1)).toBe('Remove from watchlist');
    expect(unwatchlistConfirmLabel(manga, 2)).toBe('Remove from 2 reading lists');
  });

  test('the toast headline states the verb; providers go in the message', () => {
    expect(addedToastTitle(film)).toBe('Added to watchlist');
    expect(addedToastTitle(manga)).toBe('Added to reading list');
    expect(removedToastTitle(film)).toBe('Removed from watchlist');
    expect(removedToastTitle(manga)).toBe('Removed from reading list');
  });
});

/**
 * Plan 0035 R3/R4. The warning is the price of letting a CURRENT entry be
 * removed at all: the delete destroys progress, score and notes, so a removal
 * that fires without this text on screen is data loss the user never agreed to.
 * R4's other half matters just as much — a bare PLANNING removal keeps its
 * silent path and gains no new friction.
 */
describe('removalLine (the remove sheet’s confirm step)', () => {
  test('a Planning entry only leaves the list; an entry in progress is deleted whole', () => {
    const book = { item: { type: 'BOOK' as const } };
    expect(removalLine('hardcover', book)).toEqual({ text: 'Leaves Want to Read.', destructive: false });
    expect(removalLine('anilist', { ...book, anilistStatus: 'PLANNING' })).toEqual({ text: 'Deletes the Planning entry.', destructive: false });
    expect(removalLine('anilist', { ...book, anilistStatus: 'CURRENT' }).destructive).toBe(true);
  });

  test('a Simkl row that still holds watch history is deleted whole', () => {
    const show = { item: { type: 'TV' as const } };
    expect(removalLine('simkl', { ...show, simklWatchedCount: 0 })).toEqual({ text: 'Leaves Plan to Watch.', destructive: false });
    expect(removalLine('simkl', { ...show, simklWatchedCount: 12 }).destructive).toBe(true);
  });
});
