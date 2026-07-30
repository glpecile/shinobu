import { describe, expect, test } from 'bun:test';

import { isCleanWriteReport, type WriteReportLike } from './is-clean-report';

function report(partial: Partial<WriteReportLike>): WriteReportLike {
  return { succeeded: [], failed: [], outcomes: [], ...partial };
}

describe('isCleanWriteReport (plan 0032 KTD-3)', () => {
  test('every target ok, nothing leftover → clean', () => {
    expect(
      isCleanWriteReport(
        report({
          succeeded: ['trakt', 'anilist'],
          outcomes: [
            { provider: 'trakt', status: 'ok' },
            { provider: 'anilist', status: 'ok' },
          ],
        }),
      ),
    ).toBe(true);
  });

  test('a failure keeps the sheet open — the link has to land somewhere', () => {
    expect(
      isCleanWriteReport(
        report({
          succeeded: ['trakt'],
          failed: ['letterboxd'],
          outcomes: [
            { provider: 'trakt', status: 'ok' },
            { provider: 'letterboxd', status: 'error', message: 'session expired' },
          ],
        }),
      ),
    ).toBe(false);
  });

  test('a reasoned skip is something left to read', () => {
    expect(
      isCleanWriteReport(
        report({
          succeeded: ['trakt'],
          outcomes: [
            { provider: 'trakt', status: 'ok' },
            {
              provider: 'anilist',
              status: 'skipped',
              reason: 'already on your watchlist',
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  test('a reconcile skip (no reason) is a footnote, not a recourse', () => {
    expect(
      isCleanWriteReport(
        report({
          succeeded: ['trakt'],
          outcomes: [
            { provider: 'trakt', status: 'ok' },
            { provider: 'anilist', status: 'skipped' },
          ],
        }),
      ),
    ).toBe(true);
  });

  test('nothing succeeded → never clean, even with no failures', () => {
    expect(isCleanWriteReport(report({}))).toBe(false);
  });

  test('a partial success (ok with a reason) is news the toast cannot carry (plan 0031 R16)', () => {
    // Serializd's season-filtered add: written, except the watched seasons.
    // Closing on the toast would drop the one line correcting "watchlisted".
    expect(
      isCleanWriteReport(
        report({
          succeeded: ['trakt', 'serializd'],
          outcomes: [
            { provider: 'trakt', status: 'ok' },
            {
              provider: 'serializd',
              status: 'ok',
              reason: 'S1 and S2 are already watched on Serializd',
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  test('upfront manual/unknown rows are not news — still clean (plan 0033 R1)', () => {
    // The caller may have manual rows on the sheet (e.g. Letterboxd on web);
    // they were visible before confirm, so they never block the toast+close.
    expect(
      isCleanWriteReport(
        report({
          succeeded: ['trakt'],
          outcomes: [{ provider: 'trakt', status: 'ok' }],
        }),
      ),
    ).toBe(true);
  });
});
