import { describe, expect, test } from 'bun:test';

import { manualRowsFor } from '@/features/log-media/manual-write-links';
import type { ProviderWriteOutcome } from '@/features/log-media/fan-out';
import { splitWriteTargets } from '@/lib/providers/routing';
import type { NormalizedMediaItem } from '@/types/media';

import {
  addedToastTitle,
  addedToSentence,
  alreadyOnSentence,
  destructiveRemoveWarning,
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

  test('an already-there skip is its own headline, not a success', () => {
    const view = watchlistResultView(
      report([
        { provider: 'trakt', status: 'skipped', reason: 'already on your watchlist' },
      ]),
      FILM,
    );
    expect(view.allSkip).toBe(true);
    expect(alreadyOnSentence(view.reasonedSkips)).toBe('Already on Trakt.');
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

  test('a known-absent item is unsettled', () => {
    expect(isWatchlistCtaSettled(false, null)).toBe(false);
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

  test('an all-ok report settles once membership lands, not before', () => {
    const view = watchlistResultView(
      report([{ provider: 'trakt', status: 'ok' }]),
      FILM,
    );
    expect(isWatchlistCtaSettled(undefined, view)).toBe(false);
    expect(isWatchlistCtaSettled(true, view)).toBe(true);
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

  // U10's probe discharged KTD-10's named risk
  // (docs/solutions/serializd-watchlist-clears-watched.md), so the add is a
  // real toggle on every platform — the *remove* is the verb that stays a
  // manual row (R32/R35), covered by use-unwatchlist-media.test.ts.
  test('Serializd is a writable add target on native since the U10 flip', () => {
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
    expect(writable).toEqual(['trakt', 'serializd']);
    expect(manual).toEqual([]);
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
    expect(unwatchlistConfirmLabel(film, 3)).toBe('Remove from 3 watchlists');
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
describe('destructiveRemoveWarning (plan 0035 R3/R4)', () => {
  test('a CURRENT AniList row warns, and names what is lost', () => {
    const warning = destructiveRemoveWarning({
      anilistStatus: 'CURRENT',
      targets: ['trakt', 'anilist'],
    });
    expect(warning).toContain('deletes your whole AniList entry');
    expect(warning).toContain('progress');
  });

  test('a PLANNING row is the silent path — no warning at all (R4)', () => {
    expect(
      destructiveRemoveWarning({ anilistStatus: 'PLANNING', targets: ['anilist'] }),
    ).toBeNull();
  });

  test('a row with no AniList status (no AniList leg) never warns', () => {
    expect(destructiveRemoveWarning({ targets: ['trakt', 'anilist'] })).toBeNull();
  });

  test('deselecting AniList clears the warning — nothing destructive is left to run', () => {
    expect(
      destructiveRemoveWarning({
        anilistStatus: 'CURRENT',
        targets: ['trakt', 'letterboxd'],
      }),
    ).toBeNull();
  });
});
