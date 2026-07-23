import { describe, expect, it } from 'bun:test';

import {
  errorOutcomeLinks,
  manualLinkForOutcome,
  manualRowsFor,
  splitSkippedOutcomes,
} from './manual-log-links';

const ids = (externalIds: Record<string, number | string> = {}) => ({ externalIds });

describe('manualRowsFor', () => {
  it('builds one row with the film URL for a web movie with Letterboxd connected', () => {
    expect(
      manualRowsFor(['letterboxd'], { type: 'MOVIE', ...ids({ letterboxd: 'heat' }) }),
    ).toEqual([{ provider: 'letterboxd', url: 'https://letterboxd.com/film/heat/' }]);
  });

  it('degrades to the provider home URL when no item URL can be built (R4)', () => {
    expect(manualRowsFor(['letterboxd'], { type: 'MOVIE', ...ids() })).toEqual([
      { provider: 'letterboxd', url: 'https://letterboxd.com' },
    ]);
  });

  it('returns no rows for an empty manual list (e.g. native)', () => {
    expect(manualRowsFor([], { type: 'MOVIE', ...ids({ letterboxd: 'heat' }) })).toEqual([]);
  });
});

describe('manualLinkForOutcome', () => {
  const item = { type: 'MOVIE' as const, ...ids({ letterboxd: 'heat' }) };

  it('returns a link for an error outcome with a buildable URL', () => {
    expect(
      manualLinkForOutcome({ provider: 'letterboxd', status: 'error', message: 'boom' }, item),
    ).toBe('https://letterboxd.com/film/heat/');
  });

  it('returns null for an error outcome with no buildable URL', () => {
    expect(
      manualLinkForOutcome(
        { provider: 'serializd', status: 'error', message: 'boom' },
        { type: 'MOVIE', ...ids() },
      ),
    ).toBeNull();
  });

  it('returns a link for a reasoned skip', () => {
    expect(
      manualLinkForOutcome(
        { provider: 'letterboxd', status: 'skipped', reason: 'season unresolved' },
        item,
      ),
    ).toBe('https://letterboxd.com/film/heat/');
  });

  it('returns null for a reconcile skip (no reason)', () => {
    expect(
      manualLinkForOutcome({ provider: 'letterboxd', status: 'skipped' }, item),
    ).toBeNull();
  });

  it('returns null for an ok outcome', () => {
    expect(manualLinkForOutcome({ provider: 'letterboxd', status: 'ok' }, item)).toBeNull();
  });
});

describe('errorOutcomeLinks', () => {
  const item = { type: 'MOVIE' as const, ...ids({ letterboxd: 'heat' }) };

  it('includes only error outcomes with a buildable link', () => {
    expect(
      errorOutcomeLinks(
        [
          { provider: 'letterboxd', status: 'error', message: 'boom' },
          { provider: 'serializd', status: 'error', message: 'no url' },
          { provider: 'trakt', status: 'ok' },
          { provider: 'anilist', status: 'skipped', reason: 'x' },
        ],
        item,
      ),
    ).toEqual([{ provider: 'letterboxd', url: 'https://letterboxd.com/film/heat/' }]);
  });

  it('returns an empty array when no error outcomes exist', () => {
    expect(errorOutcomeLinks([{ provider: 'trakt', status: 'ok' }], item)).toEqual([]);
  });
});

describe('splitSkippedOutcomes', () => {
  it('puts a no-reason skip in reconcileSkipped and a reasoned skip in reasonedSkips', () => {
    expect(
      splitSkippedOutcomes([
        { provider: 'trakt', status: 'skipped' },
        { provider: 'serializd', status: 'skipped', reason: 'season unresolved' },
        { provider: 'anilist', status: 'ok' },
        { provider: 'letterboxd', status: 'error', message: 'boom' },
      ]),
    ).toEqual({
      reconcileSkipped: ['trakt'],
      reasonedSkips: [
        { provider: 'serializd', status: 'skipped', reason: 'season unresolved' },
      ],
    });
  });

  it('returns empty buckets when there are no skipped outcomes', () => {
    expect(splitSkippedOutcomes([{ provider: 'trakt', status: 'ok' }])).toEqual({
      reconcileSkipped: [],
      reasonedSkips: [],
    });
  });
});
