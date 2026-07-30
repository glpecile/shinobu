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

  test('leftover manual/unknown rows keep the sheet open', () => {
    expect(
      isCleanWriteReport(
        report({
          succeeded: ['trakt'],
          outcomes: [{ provider: 'trakt', status: 'ok' }],
        }),
        ['serializd'],
      ),
    ).toBe(false);
  });
});
