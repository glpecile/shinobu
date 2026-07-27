import { describe, expect, test } from 'bun:test';

import type { AniZipEpisodeMap } from './anizip';
import { translateEntryEpisodes } from './episode-translation';

/** Entry-relative 1..n → canonical `season`, starting at `firstCanonical`. */
function table(
  season: number,
  entryNumbers: readonly number[],
  firstCanonical = 1,
): AniZipEpisodeMap {
  return new Map(
    entryNumbers.map((entryNumber, index) => [
      entryNumber,
      { season, number: firstCanonical + index },
    ]),
  );
}

const ONE_TO_ELEVEN = table(2, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

describe('translateEntryEpisodes', () => {
  test('a sequel entry batch resolves straight out of the table', () => {
    expect(translateEntryEpisodes(ONE_TO_ELEVEN, [1, 2, 3])).toEqual({
      ok: true,
      episodes: [
        { season: 2, number: 1 },
        { season: 2, number: 2 },
        { season: 2, number: 3 },
      ],
    });
  });

  test('a split-cour entry keeps its canonical offset', () => {
    // Mushoku Tensei S2 part 2: the entry's episode 1 is S02E13.
    expect(translateEntryEpisodes(table(2, [1, 2, 3], 13), [2])).toEqual({
      ok: true,
      episodes: [{ season: 2, number: 14 }],
    });
  });

  test('a season-1 entry translates to today’s payload byte for byte', () => {
    expect(translateEntryEpisodes(table(1, [1, 2, 3, 4, 5]), [4])).toEqual({
      ok: true,
      episodes: [{ season: 1, number: 4 }],
    });
  });

  test('the just-aired episode extrapolates within the mapped season', () => {
    expect(translateEntryEpisodes(ONE_TO_ELEVEN, [12])).toEqual({
      ok: true,
      episodes: [{ season: 2, number: 12 }],
    });
  });

  test('a table spanning two canonical seasons never extrapolates across the boundary', () => {
    const split: AniZipEpisodeMap = new Map([
      ...table(2, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
      // Contiguous entry-side, but the canonical season changes.
      [12, { season: 3, number: 1 }],
    ]);

    const result = translateEntryEpisodes(split, [13]);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('more than one canonical season');
  });

  // The long-runner shape: one AniList entry (One Piece, Detective Conan)
  // against a TVDB show split into many seasons. KTD3 puts "multi-season
  // table" in the unmappable list, so even a direct hit is refused — these are
  // also where TVDB and TMDB season splits diverge most (KTD6), so a
  // "precise" row is the least trustworthy one to hand Serializd.
  test('a multi-season table is refused even for an episode it carries exactly', () => {
    const longRunner: AniZipEpisodeMap = new Map([
      ...table(1, [1, 2, 3, 4]),
      [5, { season: 2, number: 1 }],
      [6, { season: 2, number: 2 }],
    ]);

    const result = translateEntryEpisodes(longRunner, [5]);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain(
      'more than one canonical season',
    );
  });

  test('past the distance bound is a miss, not a farther guess', () => {
    const result = translateEntryEpisodes(ONE_TO_ELEVEN, [14]);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('no season mapping for episode 14');
  });

  test("the entry's declared episode count caps extrapolation independently", () => {
    // 13 is only two past the table's end, but the entry only has 12 episodes.
    const result = translateEntryEpisodes(ONE_TO_ELEVEN, [13], 12);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('past this entry');

    // Inside the declared count, the same distance still resolves.
    expect(translateEntryEpisodes(ONE_TO_ELEVEN, [12], 12)).toEqual({
      ok: true,
      episodes: [{ season: 2, number: 12 }],
    });
  });

  test('a gapped table is untrustworthy even for an episode it does carry', () => {
    const gapped: AniZipEpisodeMap = new Map([
      ...table(2, [1, 2, 3, 4]),
      ...table(2, [6, 7, 8, 9, 10, 11], 6),
    ]);

    const result = translateEntryEpisodes(gapped, [3]);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('gaps');
  });

  test('a missing or empty map is an honest miss', () => {
    expect(translateEntryEpisodes(null, [1])).toEqual({
      ok: false,
      reason: 'no ani.zip season mapping for this entry',
    });
    expect(translateEntryEpisodes(new Map(), [1]).ok).toBe(false);
    expect(translateEntryEpisodes(ONE_TO_ELEVEN, []).ok).toBe(false);
  });

  test('all-or-nothing: one unmappable episode fails the whole batch', () => {
    // 11 maps, 20 is far past the table — nothing is written for either.
    const result = translateEntryEpisodes(ONE_TO_ELEVEN, [11, 20]);
    expect(result.ok).toBe(false);
  });

  test('an episode below the table start never resolves by extrapolation', () => {
    // A table that starts at entry 3 (a partially populated dataset): entry 1
    // is unknown, and counting *backwards* is exactly the fabricated write.
    expect(translateEntryEpisodes(table(2, [3, 4, 5], 3), [1]).ok).toBe(false);
  });
});
