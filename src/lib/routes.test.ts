import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { routes } from './routes';

describe('the watchlist route (plan 0031 R24)', () => {
  test('the surface is provider-neutral', () => {
    // One cross-provider surface, so no provider in its path — the same reason
    // its header carries no provider mark.
    expect(routes.watchlist).toBe('/watchlist');
  });

  test('the shipped /watchlist/letterboxd URL still resolves, as a redirect', () => {
    // It was `routes.letterboxdWatchlist` and has shipped on web: deleting the
    // route outright breaks bookmarks and deep links, so the file stays and
    // sends visitors to the merged surface.
    const path = 'src/app/watchlist/letterboxd.tsx';
    expect(existsSync(path)).toBe(true);
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('Redirect');
    expect(source).toContain('routes.watchlist');
  });
});
