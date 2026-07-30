import { describe, expect, test } from 'bun:test';

import { toastPresentation } from './options';

describe('toastPresentation', () => {
  test('success maps to the done preset', () => {
    expect(toastPresentation('success', 'Added to watchlist')).toEqual({
      title: 'Added to watchlist',
      preset: 'done',
      duration: 2,
      haptic: 'none',
    });
  });

  test('error maps to the error preset with a longer duration', () => {
    const presentation = toastPresentation('error', 'Could not log');
    expect(presentation.preset).toBe('error');
    expect(presentation.duration).toBeGreaterThan(
      toastPresentation('success', 'ok').duration,
    );
  });

  test('carries the message only when one is given', () => {
    expect(
      toastPresentation('success', 'Added', 'Trakt, AniList').message,
    ).toBe('Trakt, AniList');
    expect('message' in toastPresentation('success', 'Added')).toBe(false);
    expect('message' in toastPresentation('success', 'Added', '')).toBe(false);
  });

  test('never delegates the haptic to burnt — the wrapper fires it (R10)', () => {
    // burnt's `haptic` option is iOS-only; the Android buzz comes from
    // @/lib/haptics in the wrapper, so a non-'none' value here would
    // double-fire iOS and still leave Android silent.
    expect(toastPresentation('success', 't').haptic).toBe('none');
    expect(toastPresentation('error', 't').haptic).toBe('none');
  });
});
