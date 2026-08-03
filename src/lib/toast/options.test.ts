import { describe, expect, test } from 'bun:test';

import { toastPresentation } from './options';

describe('toastPresentation', () => {
  test('success is a short toast', () => {
    expect(toastPresentation('success', 'Added to watchlist')).toEqual({
      title: 'Added to watchlist',
      options: { duration: 2000 },
    });
  });

  test('error lingers longer than success', () => {
    expect(toastPresentation('error', 'Could not log').options.duration).toBeGreaterThan(
      toastPresentation('success', 'ok').options.duration,
    );
  });

  test('carries the description only when a message is given', () => {
    expect(
      toastPresentation('success', 'Added', 'Trakt, AniList').options.description,
    ).toBe('Trakt, AniList');
    expect(
      'description' in toastPresentation('success', 'Added').options,
    ).toBe(false);
    expect(
      'description' in toastPresentation('success', 'Added', '').options,
    ).toBe(false);
  });
});
