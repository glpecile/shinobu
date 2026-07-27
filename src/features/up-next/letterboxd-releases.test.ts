import { describe, expect, test } from 'bun:test';

import { mergeCatalogueMetadata } from '@/lib/providers/merge-metadata';
import { pickMovieMatch } from '@/lib/providers/pick-movie-match';
import type { NormalizedMediaItem, ReleaseCalendar } from '@/types/media';

import {
  letterboxdReleaseInputs,
  selectReleaseCandidates,
  type ResolveWatchlistFilm,
} from './letterboxd-releases';

/** A watchlist row exactly as `normalizeWatchlistFilm` shapes it: no ids, no dates. */
function film(slug: string, year?: number): NormalizedMediaItem {
  return {
    id: `letterboxd-${slug}`,
    title: slug.replaceAll('-', ' '),
    coverImage: '',
    ...(year != null ? { year } : {}),
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-27T00:00:00.000Z',
    externalIds: { letterboxd: slug },
  };
}

/** A TMDB catalogue record, as leg 2 of the resolve returns it. */
function catalogue(params: {
  title: string;
  year: number;
  tmdb: number;
  theatrical?: string;
  digital?: string;
  physical?: string;
}): NormalizedMediaItem {
  const releaseCalendar: ReleaseCalendar = {
    ...(params.theatrical != null ? { theatrical: params.theatrical } : {}),
    ...(params.digital != null ? { digital: params.digital } : {}),
    ...(params.physical != null ? { physical: params.physical } : {}),
  };
  return {
    id: `tmdb-${params.tmdb}`,
    title: params.title,
    coverImage: 'https://image.tmdb.org/poster.jpg',
    year: params.year,
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-27T00:00:00.000Z',
    externalIds: { tmdb: params.tmdb },
    ...(Object.keys(releaseCalendar).length > 0 ? { releaseCalendar } : {}),
  };
}

const NOW = new Date('2026-07-27T12:00:00.000Z');

/** Resolves every film to the same record — the shape, not the matching, under test. */
function alwaysResolve(record: NormalizedMediaItem): ResolveWatchlistFilm {
  return (candidate) => Promise.resolve(mergeCatalogueMetadata(candidate, record));
}

describe('selectReleaseCandidates', () => {
  test('keeps this year and later, and keeps a yearless film', () => {
    const films = [
      film('past', 2024),
      film('last-year', 2025),
      film('this-year', 2026),
      film('next-year', 2027),
      film('unscheduled'),
    ];

    const kept = selectReleaseCandidates(films, NOW).map((item) => item.id);

    // A yearless row is the announced-but-undated case this feature is for —
    // dropping it would filter out exactly the films most likely to be dated
    // inside the window.
    expect(kept).toEqual([
      'letterboxd-this-year',
      'letterboxd-next-year',
      'letterboxd-unscheduled',
    ]);
  });

  test('caps the candidate list', () => {
    const films = Array.from({ length: 50 }, (_, index) =>
      film(`upcoming-${index}`, 2026),
    );

    expect(selectReleaseCandidates(films, NOW)).toHaveLength(30);
    // The cap applies *after* the filter, so a backlog-heavy watchlist doesn't
    // spend its whole budget on films the filter would have dropped.
    expect(selectReleaseCandidates([...films, film('old', 1999)], NOW, 5)).toEqual(
      films.slice(0, 5),
    );
  });
});

describe('letterboxdReleaseInputs', () => {
  test('one film yields one input per dated release kind, tagged letterboxd', async () => {
    const inputs = await letterboxdReleaseInputs(
      [film('the-drama', 2026)],
      NOW,
      alwaysResolve(
        catalogue({
          title: 'The Drama',
          year: 2026,
          tmdb: 1234,
          theatrical: '2026-07-31',
          digital: '2026-09-04',
        }),
      ),
    );

    expect(inputs).toEqual([
      {
        item: expect.objectContaining({ id: 'letterboxd-the-drama' }),
        kind: 'theatrical',
        date: '2026-07-31',
        source: 'letterboxd',
      },
      {
        item: expect.objectContaining({ id: 'letterboxd-the-drama' }),
        kind: 'digital',
        date: '2026-09-04',
        source: 'letterboxd',
      },
    ]);
    // The resolved TMDB id rides along — it is the only thing that can collapse
    // this row against the same film on the Trakt watchlist (KTD-6).
    expect(inputs[0]?.item.externalIds.tmdb).toBe(1234);
  });

  test('physical dates are carried but never surfaced (R3)', async () => {
    const inputs = await letterboxdReleaseInputs(
      [film('disc-only', 2026)],
      NOW,
      alwaysResolve(
        catalogue({
          title: 'Disc Only',
          year: 2026,
          tmdb: 22,
          physical: '2026-08-11',
        }),
      ),
    );

    expect(inputs).toEqual([]);
  });

  test('resolves at most the cap, however long the watchlist is', async () => {
    const attempted: string[] = [];
    const films = Array.from({ length: 80 }, (_, index) =>
      film(`upcoming-${index}`, 2026),
    );

    await letterboxdReleaseInputs(films, NOW, (candidate) => {
      attempted.push(candidate.id);
      return Promise.resolve(null);
    });

    expect(attempted).toHaveLength(30);
  });

  test('never runs more than a handful of resolves at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const films = Array.from({ length: 30 }, (_, index) =>
      film(`upcoming-${index}`, 2026),
    );

    await letterboxdReleaseInputs(films, NOW, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return null;
    });

    // Two calls per film, so an unbounded fan would be a 60-request burst — the
    // shape rate limiters punish, for a source nothing on screen waits on.
    expect(peak).toBeLessThanOrEqual(4);
  });

  test('a rejected resolve costs that film’s entry, never the section (R7)', async () => {
    const dated = catalogue({
      title: 'Survivor',
      year: 2026,
      tmdb: 7,
      theatrical: '2026-08-01',
    });

    const inputs = await letterboxdReleaseInputs(
      [film('broken', 2026), film('survivor', 2026)],
      NOW,
      (candidate) =>
        candidate.id === 'letterboxd-broken'
          ? Promise.reject(new Error('TMDB 503'))
          : Promise.resolve(mergeCatalogueMetadata(candidate, dated)),
    );

    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.item.id).toBe('letterboxd-survivor');
  });

  test('a film the catalogue has no dates for contributes nothing', async () => {
    const inputs = await letterboxdReleaseInputs(
      [film('undated', 2026)],
      NOW,
      alwaysResolve(catalogue({ title: 'Undated', year: 2026, tmdb: 9 })),
    );

    expect(inputs).toEqual([]);
  });
});

/**
 * The id leg composed exactly as `cachedTmdbMovieIdByTitle` composes it: TMDB
 * search results in, `pickMovieMatch` deciding which one *is* the film. A wrong
 * match here doesn't merely degrade metadata like it does on the details screen
 * — it puts a different film on the user's calendar with a date that has
 * nothing to do with the one they watchlisted
 * (docs/solutions/trakt-text-search-wrong-movie-match.md).
 */
function gatedResolve(
  results: readonly NormalizedMediaItem[],
): ResolveWatchlistFilm {
  return (candidate) => {
    const match = pickMovieMatch(results, candidate.year, candidate.title);
    return Promise.resolve(
      match == null ? null : mergeCatalogueMetadata(candidate, match),
    );
  };
}

describe('letterboxdReleaseInputs — the title+year gate (KTD-5)', () => {
  test('an exact title match with the wrong year is dropped, not guessed', async () => {
    const inputs = await letterboxdReleaseInputs(
      [film('the odyssey', 2026)],
      NOW,
      gatedResolve([
        catalogue({
          title: 'the odyssey',
          year: 1997,
          tmdb: 999,
          digital: '2026-07-29',
        }),
      ]),
    );

    // Kubrick's back catalogue must not turn into "streaming this Wednesday".
    expect(inputs).toEqual([]);
  });

  test('two same-title films either side of the year is a coin flip, so no entry', async () => {
    const inputs = await letterboxdReleaseInputs(
      [film('labyrinth', 2026)],
      NOW,
      gatedResolve([
        catalogue({ title: 'labyrinth', year: 2025, tmdb: 1, digital: '2026-07-28' }),
        catalogue({ title: 'labyrinth', year: 2027, tmdb: 2, digital: '2026-07-30' }),
      ]),
    );

    expect(inputs).toEqual([]);
  });

  test('the same year and title resolves, and the dates come through', async () => {
    const inputs = await letterboxdReleaseInputs(
      [film('labyrinth', 2026)],
      NOW,
      gatedResolve([
        catalogue({ title: 'Labyrinth of Cinema', year: 2026, tmdb: 3 }),
        catalogue({ title: 'labyrinth', year: 2026, tmdb: 4, theatrical: '2026-08-02' }),
      ]),
    );

    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.item.externalIds.tmdb).toBe(4);
    expect(inputs[0]?.date).toBe('2026-08-02');
  });
});
