import { describe, expect, test } from 'bun:test';

import type { NormalizedMediaItem, PersonCreditRow } from '@/types/media';

import { mergeCreditRows, roleCounts, timelineRows } from './group';

// Local noon: `filmReleaseStatus` parses a bare date as local midnight.
const NOW = new Date(2026, 8, 15, 12, 0, 0);

function item(
  id: string,
  title: string,
  type: 'MOVIE' | 'TV',
  releaseDate: string | null,
): NormalizedMediaItem {
  return {
    id,
    title,
    type,
    coverImage: '',
    backdropImage: '',
    ...(releaseDate != null
      ? { year: Number(releaseDate.slice(0, 4)), releaseDate }
      : {}),
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-09-15T00:00:00.000Z',
    externalIds: {},
  };
}

const heron = item('m1', 'The Boy and the Heron', 'MOVIE', '2023-07-14');
const wind = item('m2', 'The Wind Rises', 'MOVIE', '2013-07-20');
const hound = item('t1', 'Sherlock Hound', 'TV', '1984-11-06');
const unreleased = item('m3', 'Unreleased Film', 'MOVIE', null);
const scheduled = item('m4', 'Next Spring', 'MOVIE', '2027-04-01');

const rows: PersonCreditRow[] = [
  {
    role: 'Directing',
    items: [unreleased, heron, wind, hound],
    details: {},
    roles: { m3: 'Director', m1: 'Director', m2: 'Director', t1: 'Director' },
  },
  {
    role: 'Writing',
    items: [scheduled, heron, hound],
    details: {},
    roles: { m4: 'Screenplay', m1: 'Writer, Original Story', t1: 'Storyboard' },
  },
];

describe('mergeCreditRows', () => {
  test('folds a title credited on several rows into one credit with every role', () => {
    const { credits, roles } = mergeCreditRows(rows);
    expect(roles).toEqual(['Directing', 'Writing']);
    expect(credits.map((credit) => credit.item.id)).toEqual(['m3', 'm1', 'm2', 't1', 'm4']);
    expect(credits[1].roles).toEqual([
      { role: 'Directing', detail: 'Director' },
      { role: 'Writing', detail: 'Writer, Original Story' },
    ]);
  });
});

describe('roleCounts', () => {
  test('counts titles per role under the format, dropping roles left empty', () => {
    const filmography = mergeCreditRows(rows);
    expect(roleCounts(filmography, 'ALL')).toEqual([
      { role: 'Directing', count: 4 },
      { role: 'Writing', count: 3 },
    ]);
    expect(roleCounts(filmography, 'TV')).toEqual([
      { role: 'Directing', count: 1 },
      { role: 'Writing', count: 1 },
    ]);
  });
});

describe('timelineRows', () => {
  const { credits } = mergeCreditRows(rows);

  test('leads with a folded upcoming head, then one head per year, newest first', () => {
    const result = timelineRows(credits, {
      format: 'ALL',
      role: null,
      showUpcoming: false,
      now: NOW,
    });
    expect(
      result.map((row) => (row.kind === 'head' ? [row.year, row.count, row.open] : row.key)),
    ).toEqual([
      [null, 2, false],
      [2023, 1, true],
      'm1',
      [2013, 1, true],
      'm2',
      [1984, 1, true],
      't1',
    ]);
  });

  test('opens the upcoming head soonest-first with undated work last, and marks group ends', () => {
    const result = timelineRows(credits, {
      format: 'ALL',
      role: null,
      showUpcoming: true,
      now: NOW,
    });
    expect(result.slice(0, 3).map((row) => (row.kind === 'entry' ? [row.key, row.last] : row.open)))
      .toEqual([true, ['m4', false], ['m3', true]]);
  });

  test('joins every role on a credit, or only the filtered one', () => {
    const all = timelineRows(credits, { format: 'ALL', role: null, showUpcoming: false, now: NOW });
    const heronRow = all.find((row) => row.kind === 'entry' && row.key === 'm1');
    expect(heronRow?.kind === 'entry' && heronRow.roles).toBe('Director, Writer, Original Story');

    const writing = timelineRows(credits, {
      format: 'MOVIE',
      role: 'Writing',
      showUpcoming: false,
      now: NOW,
    });
    expect(writing.map((row) => row.key)).toEqual(['head-upcoming', 'head-2023', 'm1']);
    expect(writing[2].kind === 'entry' && writing[2].roles).toBe('Writer, Original Story');
  });
});
