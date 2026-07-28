import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { routes } from './routes';

describe('the watchlist route (plan 0031 R24)', () => {
  test('the surface is provider-neutral', () => {
    // One cross-provider surface, so no provider in its path — the same reason
    // its header carries no provider mark.
    expect(routes.watchlist).toBe('/watchlist');
  });

  test('Letterboxd keeps its own films-only grid beside the merged one', () => {
    // Owner, 2026-07-28: the merged surface does not replace this one. R24
    // originally redirected `/watchlist/letterboxd` into `/watchlist`; that was
    // reversed, because a curated Letterboxd film list merged with Trakt shows
    // and AniList plans stops being browsable as itself.
    expect(routes.letterboxdWatchlist).toBe('/watchlist/letterboxd');

    const path = 'src/app/watchlist/letterboxd.tsx';
    expect(existsSync(path)).toBe(true);
    const source = readFileSync(path, 'utf8');
    // A real screen, not a redirect into the merged grid.
    expect(source).not.toContain('<Redirect');
    expect(source).toContain('useLetterboxdWatchlistPagesQuery');
  });

  test('the two watchlist surfaces are distinct routes', () => {
    // Sibling paths, so `/watchlist` must not swallow `/watchlist/letterboxd`
    // and each row's "View all" lands somewhere different.
    expect(routes.watchlist).not.toBe(routes.letterboxdWatchlist);
    expect(routes.letterboxdWatchlist.startsWith(routes.watchlist)).toBe(true);
  });
});
