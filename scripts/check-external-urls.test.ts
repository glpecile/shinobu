import { describe, expect, test } from 'bun:test';

// Offline guard for the link-health manifest. Importing the script here also
// enforces its react-native-free constraint: if an RN import ever sneaks into
// external-urls.ts (or anything it pulls in), this whole file fails to load
// under bun:test — in CI, before the scheduled network probe ever runs.
import { URL_CHECKS } from './check-external-urls';

describe('external URL manifest', () => {
  test('has a check per provider surface', () => {
    const names = URL_CHECKS.map((c) => c.name);
    expect(names.some((n) => n.startsWith('Trakt'))).toBe(true);
    expect(names.some((n) => n.startsWith('AniList'))).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  test.each(URL_CHECKS)('$name is a well-formed https check', (check) => {
    const url = new URL(check.url);
    expect(url.protocol).toBe('https:');
    expect(check.expect.length).toBeGreaterThan(0);
    for (const status of check.expect) {
      // "Alive" can be an error status (dummy credentials), but never a
      // not-found or server error — those are what the probe must catch.
      expect(status).toBeGreaterThanOrEqual(200);
      expect(status).toBeLessThan(500);
      expect(status).not.toBe(404);
      expect(status).not.toBe(410);
    }
  });

  test('setup pages are checked against the post-migration Trakt domain', () => {
    const traktCreate = URL_CHECKS.find((c) => c.name === 'Trakt create-app page');
    // trakt.tv/oauth/applications 301s into a 404 since July 2026 — the
    // create-app link must stay on app.trakt.tv (docs/solutions).
    expect(traktCreate?.url).toStartWith('https://app.trakt.tv/');
  });
});
