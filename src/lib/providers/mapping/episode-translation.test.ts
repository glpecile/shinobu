import { describe, expect, test } from 'bun:test';

import type { AniZipEpisodeMap } from './anizip';
import { translateEntryEpisodes } from './episode-translation';
import type { SeasonLayout } from './season-layout';

/**
 * Entry-relative 1..n → canonical `season`, starting at `firstCanonical` and
 * `firstAbsolute`. Mirrors an ani.zip table: every row carries both the TVDB
 * pair and the absolute position.
 */
function table(
  season: number,
  entryNumbers: readonly number[],
  firstCanonical = 1,
  firstAbsolute = firstCanonical,
): AniZipEpisodeMap {
  return new Map(
    entryNumbers.map((entryNumber, index) => [
      entryNumber,
      {
        season,
        number: firstCanonical + index,
        absolute: firstAbsolute + index,
      },
    ]),
  );
}

/** The layouts below are the real ones, probed 2026-07-27 (both trackers agreed). */
const ONE_CONTINUOUS_SEASON: SeasonLayout = [{ season: 1, episodeCount: 24 }];
const SPLIT_BY_SEASON: SeasonLayout = [
  { season: 0, episodeCount: 3 },
  { season: 1, episodeCount: 23 },
  { season: 2, episodeCount: 24 },
  { season: 3, episodeCount: 5 },
];

const SEQUEL_TABLE = table(2, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 1, 13);

describe('translateEntryEpisodes', () => {
  test('a tracker that splits by season takes ani.zip’s pair verbatim', () => {
    // Mushoku Tensei S2 part 2: entry 1 is S02E13 (absolute 38). Both trackers
    // really do have a 24-episode season 2, so the TVDB pair is correct — and
    // counting absolutely would land on S02E15 instead.
    const splitCour = table(2, [1, 2, 3], 13, 38);

    expect(
      translateEntryEpisodes(splitCour, [1], { layout: SPLIT_BY_SEASON }),
    ).toEqual({ ok: true, episodes: [{ season: 2, number: 13 }] });
  });

  test('a tracker with one continuous season places by absolute number', () => {
    // Dan Da Dan S2: ani.zip says S02E01, but Trakt and TMDB both hold a
    // single 24-episode season — so this is episode 13 of season 1.
    expect(
      translateEntryEpisodes(SEQUEL_TABLE, [1], { layout: ONE_CONTINUOUS_SEASON }),
    ).toEqual({ ok: true, episodes: [{ season: 1, number: 13 }] });
  });

  test('the reported bug: 100 Girlfriends S3 E4 lands on S01E28', () => {
    // ani.zip: entry 4 → S03E04, absolute 28. Trakt: S1 with 28 episodes.
    const season3 = table(3, [1, 2, 3, 4, 5, 6], 1, 25);

    expect(
      translateEntryEpisodes(season3, [4], {
        layout: [{ season: 1, episodeCount: 28 }],
      }),
    ).toEqual({ ok: true, episodes: [{ season: 1, number: 28 }] });
  });

  test('specials never absorb absolute numbering', () => {
    // Solo Leveling S2: entry 1 → S02E01 absolute 13, layout S0:1 S1:25. The
    // single special must not shift the count to S01E12.
    expect(
      translateEntryEpisodes(SEQUEL_TABLE, [1], {
        layout: [
          { season: 0, episodeCount: 1 },
          { season: 1, episodeCount: 25 },
        ],
      }),
    ).toEqual({ ok: true, episodes: [{ season: 1, number: 13 }] });
  });

  test('a batch resolves every episode into the destination’s numbering', () => {
    expect(
      translateEntryEpisodes(SEQUEL_TABLE, [1, 2, 3], {
        layout: ONE_CONTINUOUS_SEASON,
      }),
    ).toEqual({
      ok: true,
      episodes: [
        { season: 1, number: 13 },
        { season: 1, number: 14 },
        { season: 1, number: 15 },
      ],
    });
  });

  test('a season-1 entry translates to today’s payload byte for byte', () => {
    expect(
      translateEntryEpisodes(table(1, [1, 2, 3, 4, 5]), [4], {
        layout: [{ season: 1, episodeCount: 12 }],
      }),
    ).toEqual({ ok: true, episodes: [{ season: 1, number: 4 }] });
  });

  test('the just-aired episode extrapolates, then still gets placed', () => {
    // Entry 12 isn't in the table yet; projected to S02E12 / absolute 24, then
    // placed into the single continuous season as episode 24.
    expect(
      translateEntryEpisodes(SEQUEL_TABLE, [12], { layout: ONE_CONTINUOUS_SEASON }),
    ).toEqual({ ok: true, episodes: [{ season: 1, number: 24 }] });
  });

  test('a long-runner resolves against the destination instead of being refused', () => {
    // One AniList entry, a TVDB table that crosses a season boundary. The rows
    // it carries are real data — only guessing *past* the boundary is barred.
    const longRunner: AniZipEpisodeMap = new Map([
      ...table(1, [1, 2, 3, 4]),
      [5, { season: 2, number: 1, absolute: 5 }],
      [6, { season: 2, number: 2, absolute: 6 }],
    ]);

    expect(
      translateEntryEpisodes(longRunner, [5], {
        layout: [
          { season: 1, episodeCount: 4 },
          { season: 2, episodeCount: 12 },
        ],
      }),
    ).toEqual({ ok: true, episodes: [{ season: 2, number: 1 }] });
  });

  test('but a boundary-crossing table still refuses to extrapolate past its end', () => {
    const longRunner: AniZipEpisodeMap = new Map([
      ...table(1, [1, 2, 3, 4]),
      [5, { season: 2, number: 1, absolute: 5 }],
    ]);

    const result = translateEntryEpisodes(longRunner, [6], {
      layout: [
        { season: 1, episodeCount: 4 },
        { season: 2, episodeCount: 12 },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('season boundary');
  });

  test('past the distance bound is a miss, not a farther guess', () => {
    const result = translateEntryEpisodes(SEQUEL_TABLE, [14], {
      layout: ONE_CONTINUOUS_SEASON,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain(
      'no season mapping for episode 14',
    );
  });

  test("the entry's declared episode count caps extrapolation independently", () => {
    // 13 is only two past the table's end, but the entry only has 12 episodes.
    const result = translateEntryEpisodes(SEQUEL_TABLE, [13], {
      layout: ONE_CONTINUOUS_SEASON,
      declaredEpisodeCount: 12,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('past this entry');

    // Inside the declared count, the same distance still resolves.
    expect(
      translateEntryEpisodes(SEQUEL_TABLE, [12], {
        layout: ONE_CONTINUOUS_SEASON,
        declaredEpisodeCount: 12,
      }),
    ).toEqual({ ok: true, episodes: [{ season: 1, number: 24 }] });
  });

  test('a gapped table is untrustworthy even for an episode it does carry', () => {
    const gapped: AniZipEpisodeMap = new Map([
      ...table(2, [1, 2, 3, 4]),
      ...table(2, [6, 7, 8, 9, 10, 11], 6, 6),
    ]);

    const result = translateEntryEpisodes(gapped, [3], {
      layout: ONE_CONTINUOUS_SEASON,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('gaps');
  });

  test('an episode the destination simply does not have is a miss', () => {
    // Mapped to episode 24 absolute, but this show only holds 12.
    const result = translateEntryEpisodes(SEQUEL_TABLE, [11], {
      layout: [{ season: 1, episodeCount: 12 }],
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('no season');
  });

  test('an unreadable season layout is a miss, never a raw TVDB write', () => {
    const result = translateEntryEpisodes(SEQUEL_TABLE, [1], { layout: null });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("season list");
  });

  test('a missing or empty map is an honest miss', () => {
    expect(
      translateEntryEpisodes(null, [1], { layout: ONE_CONTINUOUS_SEASON }),
    ).toEqual({ ok: false, reason: 'no ani.zip season mapping for this entry' });
    expect(
      translateEntryEpisodes(new Map(), [1], { layout: ONE_CONTINUOUS_SEASON }).ok,
    ).toBe(false);
    expect(
      translateEntryEpisodes(SEQUEL_TABLE, [], { layout: ONE_CONTINUOUS_SEASON }).ok,
    ).toBe(false);
  });

  test('all-or-nothing: one unmappable episode fails the whole batch', () => {
    const result = translateEntryEpisodes(SEQUEL_TABLE, [11, 20], {
      layout: ONE_CONTINUOUS_SEASON,
    });
    expect(result.ok).toBe(false);
  });

  test('an episode below the table start never resolves by extrapolation', () => {
    expect(
      translateEntryEpisodes(table(2, [3, 4, 5], 3, 15), [1], {
        layout: ONE_CONTINUOUS_SEASON,
      }).ok,
    ).toBe(false);
  });
});
