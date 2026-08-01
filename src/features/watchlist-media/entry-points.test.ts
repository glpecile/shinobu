import { describe, expect, test } from 'bun:test';

/**
 * The one part of U8 that is pure call-site wiring: which surfaces offer the
 * want-to-watch row (plan 0031 R12). The app renders nothing under `bun test`
 * — there is no renderer in this repo — so this reads the call sites the way
 * `scripts/check-*.ts` do, which is still strictly better than trusting a
 * default nobody checks. The row defaults **on**, so a new sheet call site is
 * covered by construction and only an opt-out can be wrong.
 */
const SHEET = 'src/features/card-actions/card-actions-sheet.tsx';

async function source(path: string): Promise<string> {
  return await Bun.file(path).text();
}

describe('the want-to-watch row is on by default (plan 0031 R12)', () => {
  test('the sheet declares the prop and defaults it on', async () => {
    const sheet = await source(SHEET);
    expect(sheet).toContain('canWatchlist?: boolean');
    expect(sheet).toContain('canWatchlist = true');
    expect(sheet).toContain('WatchlistMediaButton');
  });

  test('the diary opts out — every row there is already watched', async () => {
    expect(await source('src/app/(tabs)/diary.tsx')).toContain(
      'canWatchlist={false}',
    );
  });

  test('search, feed, person and studio need no edit to get it', async () => {
    for (const path of [
      'src/app/(tabs)/search.tsx',
      'src/app/(tabs)/index.tsx',
      'src/app/person/[id].tsx',
      'src/app/studio/[id].tsx',
    ]) {
      const text = await source(path);
      expect(text).toContain('CardActionsSheet');
      expect(text).not.toContain('canWatchlist');
    }
  });
});

/**
 * The removal's placement (plan 0031 R35/U16), read the same way. R35's rule is
 * about **evidence**, not about which screen you are on: a removal must route
 * off a `WatchlistEntry`'s `sources`, never off the item alone. Originally that
 * was enforced by making `/watchlist` the only surface that could hand one over
 * — until a fully-watchlisted feed card rendered a disabled "On your watchlist"
 * with nothing behind it (owner report 2026-08-01).
 *
 * The sheet now derives the entry from the gathered cache when the host has
 * none, which satisfies the actual rule: the `sources`, `errors` and
 * `incomplete` are the gather's, and an item the gather doesn't hold yields
 * `null`. What this reads for is that the derivation is the *only* new source —
 * no call site synthesizes an entry, and none renders the button itself.
 */
describe('the remove row routes off gathered evidence (plan 0031 R35)', () => {
  test('the sheet takes the entry, or derives it from the gather — never from the item alone', async () => {
    const sheet = await source(SHEET);
    expect(sheet).toContain('watchlistRemoval');
    expect(sheet).toContain('UnwatchlistMediaButton');
    expect(sheet).toContain('watchlistRemoval = null');
    // The one sanctioned second source, and it reads `watchlistQueryKeys.inputs()`.
    expect(sheet).toContain('useCachedWatchlistRemoval');
    const hook = await source(
      'src/features/watchlist/use-cached-watchlist-removal.ts',
    );
    expect(hook).toContain('findWatchlistRemoval');
    expect(hook).toContain('watchlistQueryKeys.inputs()');
    // Cache-only, per `useIsWatchlisted`'s one-key-one-queryFn discipline: a
    // plain subscription, never a second observer on the surface's own key.
    expect(hook).not.toContain('useQuery(');
    expect(hook).not.toContain('fetchQuery');
    expect(hook).toContain('useSyncExternalStore');
  });

  test('the watchlist grid is still the one call site that supplies an entry', async () => {
    expect(await source('src/app/watchlist/index.tsx')).toContain('watchlistRemoval={');
  });

  test('no other surface hand-rolls the removal', async () => {
    for (const path of [
      'src/app/details/[id].tsx',
      'src/app/(tabs)/search.tsx',
      'src/app/(tabs)/index.tsx',
      'src/app/(tabs)/diary.tsx',
      'src/app/person/[id].tsx',
      'src/app/studio/[id].tsx',
    ]) {
      const text = await source(path);
      expect(text).not.toContain('watchlistRemoval');
      expect(text).not.toContain('UnwatchlistMediaButton');
    }
  });
});

describe('Up Next / Calendar cards get no add affordance (plan 0031 R13)', () => {
  test('the episode card offers no action prop at all', async () => {
    const card = await source('src/features/up-next/ui/episode-card.tsx');
    expect(card).not.toContain('WatchlistMediaButton');
    expect(card).not.toContain('CardActionsSheet');
  });
});
