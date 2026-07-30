import { describe, expect, test } from 'bun:test';

import { logToastCopy } from './toast-copy';

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
