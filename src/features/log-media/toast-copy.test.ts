import { describe, expect, test } from 'bun:test';

import { episodeNoticeToastCopy, logToastCopy } from './toast-copy';

describe('logToastCopy (plan 0032 R9)', () => {
  test('names where the log landed', () => {
    expect(
      logToastCopy({ rewatch: false, succeeded: ['trakt', 'serializd'], skipped: [] }),
    ).toEqual({ title: 'Logged', message: 'Trakt, Serializd' });
  });

  test('a rewatch says so', () => {
    expect(
      logToastCopy({ rewatch: true, succeeded: ['trakt'], skipped: [] }).title,
    ).toBe('Logged rewatch');
  });

  test('a reconcile skip is the one extra fact a clean toast carries', () => {
    expect(
      logToastCopy({ rewatch: false, succeeded: ['trakt'], skipped: ['anilist'] })
        .message,
    ).toBe('Trakt — AniList already had it');
  });
});

describe('episodeNoticeToastCopy', () => {
  test('a reasoned skip does not claim an episode was logged', () => {
    expect(
      episodeNoticeToastCopy('Episode 118', {
        succeeded: [],
        failed: [],
        outcomes: [
          { provider: 'simkl', status: 'skipped', reason: 'Simkl could not match any submitted item (not_found)' },
        ],
      }),
    ).toEqual({
      tone: 'error',
      title: 'Episode 118 was not logged',
      message: 'Simkl: Simkl could not match any submitted item (not_found).',
    });
  });

  test('a failure names where it failed and where it landed', () => {
    expect(
      episodeNoticeToastCopy('Episode 118', {
        succeeded: ['anilist'],
        failed: ['simkl'],
        outcomes: [],
      }),
    ).toEqual({ tone: 'error', title: 'Episode 118 failed on Simkl', message: 'Logged on AniList.' });
  });

  test('without a failure it reports the log and carries the note', () => {
    expect(
      episodeNoticeToastCopy('Episode 118', {
        succeeded: ['simkl', 'anilist'],
        failed: [],
        outcomes: [
          { provider: 'simkl', status: 'ok', reason: 'Simkl could not match 1 of 2 submitted items' },
          { provider: 'anilist', status: 'ok' },
        ],
      }),
    ).toEqual({
      tone: 'success',
      title: 'Logged episode 118',
      message: 'Simkl, AniList. Simkl: Simkl could not match 1 of 2 submitted items.',
    });
  });
});
