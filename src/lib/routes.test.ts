import { existsSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { routes } from './routes';

describe('the watchlist route (plan 0031 R24)', () => {
  test('the surface is provider-neutral', () => {
    // One cross-provider surface, so no provider in its path — the same reason
    // its header carries no provider mark.
    expect(routes.watchlist()).toBe('/watchlist');
  });

  test('a provider narrows the one grid instead of opening a second screen', () => {
    // Owner, 2026-08-01: `/watchlist/letterboxd` is gone. A whole duplicate
    // screen answered a question the merged grid plus a filter answers, so the
    // Letterboxd feed row's "View all" now deep-links the filter — and the user
    // can widen it back to every provider without leaving the surface.
    expect(routes.watchlist('letterboxd')).toBe('/watchlist?provider=letterboxd');
    expect(existsSync('src/app/watchlist/letterboxd.tsx')).toBe(false);
  });
});
