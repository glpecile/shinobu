import { describe, expect, test } from 'bun:test';

import { chainFailure, chainLabel } from './chain-copy';

describe('chainLabel', () => {
  test('is just the verb before anything has settled', () => {
    expect(chainLabel('episode 3', { landed: 0, failed: 0 })).toBe(
      'Log episode 3',
    );
  });

  test('carries the running count', () => {
    expect(chainLabel('episode 4', { landed: 1, failed: 0 })).toBe(
      'Log episode 4 · 1 logged',
    );
  });

  test('a failure outranks the successes — it is the half needing a decision', () => {
    expect(chainLabel('episode 6', { landed: 2, failed: 1 })).toBe(
      'Log episode 6 · 1 failed',
    );
  });
});

describe('chainFailure', () => {
  test('names one or two episodes, counts more', () => {
    expect(chainFailure(['episode 6'], ['anilist'])).toBe(
      'Episode 6 failed on AniList',
    );
    expect(chainFailure(['episode 5', 'episode 6'], ['anilist'])).toBe(
      'Episode 5 and episode 6 failed on AniList',
    );
    expect(chainFailure(['e 4', 'e 5', 'e 6'], ['anilist', 'simkl'])).toBe(
      '3 episodes failed on AniList, Simkl',
    );
  });

  test('a thrown write names no provider', () => {
    expect(chainFailure(['episode 6'], [])).toBe('Episode 6 didn’t log');
  });
});
