import { describe, expect, test } from 'bun:test';

import { manualWriteReasons } from './manual-reasons';

describe('manualWriteReasons (plan 0032 R5)', () => {
  test('a platform-banned write names the platform — the permanent case', () => {
    // Letterboxd on web: `unsupportedWritePlatforms: ['web']` in the registry.
    expect(manualWriteReasons(['letterboxd'], 'watchlist', 'web')).toEqual({
      letterboxd: "Can't be added from the web",
    });
    expect(manualWriteReasons(['letterboxd'], 'log', 'web')).toEqual({
      letterboxd: "Can't be logged from the web",
    });
  });

  test("a declared-'manual' verb reads as not-yet, not never", () => {
    // Serializd's watchlist verb stays 'manual' until U10's probe (registry.ts).
    expect(manualWriteReasons(['serializd'], 'watchlist', 'ios')).toEqual({
      serializd: "Can't be added from Shinobu yet",
    });
    expect(
      manualWriteReasons(['letterboxd'], 'watchlist-remove', 'ios'),
    ).toEqual({
      letterboxd: "Can't be removed from Shinobu yet",
    });
  });

  test('the platform ban wins the copy when both reasons apply', () => {
    // Letterboxd's watchlist verb is declared manual AND web-banned — the
    // structural reason is the one worth stating (plan 0032 R12).
    expect(manualWriteReasons(['letterboxd'], 'watchlist', 'web')).toEqual({
      letterboxd: "Can't be added from the web",
    });
  });
});
