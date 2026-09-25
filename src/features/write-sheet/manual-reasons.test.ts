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
    // Serializd's watchlist remove stays 'manual' until its read leg lands (registry.ts).
    expect(manualWriteReasons(['serializd'], 'watchlist-remove', 'ios')).toEqual({
      serializd: "Can't be removed from Shinobu yet",
    });
  });
});
