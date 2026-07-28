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

describe('Up Next / Calendar cards get no add affordance (plan 0031 R13)', () => {
  test('the episode card offers no action prop at all', async () => {
    const card = await source('src/features/up-next/ui/episode-card.tsx');
    expect(card).not.toContain('WatchlistMediaButton');
    expect(card).not.toContain('CardActionsSheet');
  });
});
