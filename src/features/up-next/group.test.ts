import { describe, expect, test } from 'bun:test';

import { groupDayEntries, groupLabel, soloGroup } from './group';
import type { UpNextEntry } from './types';
import type { NormalizedMediaItem } from '@/types/media';

function item(id: string, title = 'Batman: Caped Crusader'): NormalizedMediaItem {
  return {
    id,
    title,
    coverImage: '',
    type: 'TV',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-27T00:00:00.000Z',
    externalIds: {},
  };
}

function episode(
  itemId: string,
  season: number | undefined,
  number: number,
  firstAired = '2026-07-31T04:00:00.000Z',
): UpNextEntry {
  return {
    kind: 'episode',
    id: season == null ? `${itemId}-e${number}` : `${itemId}-s${season}e${number}`,
    item: item(itemId),
    episode: {
      ...(season == null ? {} : { season }),
      number,
      firstAired,
    },
    status: 'upcoming',
    source: 'trakt',
  };
}

function release(
  itemId: string,
  kind: 'theatrical' | 'digital' | 'physical',
): UpNextEntry {
  return {
    kind: 'release',
    id: `${itemId}-${kind}`,
    item: item(itemId, 'Dune: Part Three'),
    release: { kind, date: '2026-07-31' },
    status: 'upcoming',
    source: 'trakt',
  };
}

describe('groupDayEntries', () => {
  test('collapses a season drop into one group', () => {
    const entries = Array.from({ length: 10 }, (_, index) =>
      episode('trakt-1', 2, index + 1),
    );

    const groups = groupDayEntries(entries);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.entries).toHaveLength(10);
    // The lead is the first of the day's order, so the card keys and badges
    // from the episode that actually leads the batch.
    expect(groups[0]?.lead).toBe(entries[0]!);
    expect(groups[0]?.id).toBe(entries[0]!.id);
  });

  test('leaves a single episode as an ungrouped card', () => {
    const groups = groupDayEntries([episode('trakt-1', 2, 1)]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.entries).toHaveLength(1);
  });

  test('keeps different shows apart', () => {
    const groups = groupDayEntries([
      episode('trakt-1', 2, 1),
      episode('trakt-2', 1, 4),
      episode('trakt-1', 2, 2),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.entries.length)).toEqual([2, 1]);
  });

  test('preserves the order the leads arrived in', () => {
    const groups = groupDayEntries([
      episode('trakt-2', 1, 4),
      episode('trakt-1', 2, 1),
      episode('trakt-1', 2, 2),
    ]);

    expect(groups.map((group) => group.lead.item.id)).toEqual([
      'trakt-2',
      'trakt-1',
    ]);
  });

  test('never merges a film’s release rows', () => {
    // One film, one item id, two dates that say different things — collapsing
    // them would hide the fact each row exists to carry (plan 0030 R3).
    const groups = groupDayEntries([
      release('trakt-9', 'theatrical'),
      release('trakt-9', 'digital'),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.entries.length === 1)).toBe(true);
  });

  test('groups episodes without swallowing the same show’s release row', () => {
    const groups = groupDayEntries([
      episode('trakt-1', 2, 1),
      episode('trakt-1', 2, 2),
      release('trakt-1', 'digital'),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.entries).toHaveLength(2);
    expect(groups[1]?.lead.kind).toBe('release');
  });

  test('is empty for an empty day', () => {
    expect(groupDayEntries([])).toEqual([]);
  });
});

describe('groupLabel', () => {
  test('a single episode keeps its entry label', () => {
    const entry = episode('trakt-1', 2, 1);
    expect(groupLabel(soloGroup(entry))).toBe('S2E1');
  });

  test('a batch names the shared season and the count', () => {
    const groups = groupDayEntries([
      episode('trakt-1', 2, 1),
      episode('trakt-1', 2, 2),
      episode('trakt-1', 2, 3),
    ]);

    expect(groupLabel(groups[0]!)).toBe('Season 2 · 3 episodes');
  });

  test('drops the season when the batch spans more than one', () => {
    const groups = groupDayEntries([
      episode('trakt-1', 1, 12),
      episode('trakt-1', 2, 1),
    ]);

    expect(groupLabel(groups[0]!)).toBe('2 episodes');
  });

  test('drops the season when the source states none', () => {
    // AniList entries carry no canonical season (plan 0027) — naming one here
    // is the fabrication that wrote phantom season-1 history.
    const groups = groupDayEntries([
      episode('anilist-1', undefined, 1),
      episode('anilist-1', undefined, 2),
    ]);

    expect(groupLabel(groups[0]!)).toBe('2 episodes');
  });

  test('a release keeps its release label', () => {
    expect(groupLabel(soloGroup(release('trakt-9', 'theatrical')))).toBe(
      'In theaters',
    );
  });
});

describe('soloGroup', () => {
  test('wraps one entry without grouping anything', () => {
    const entry = episode('trakt-1', 2, 1);
    const group = soloGroup(entry);

    expect(group.id).toBe(entry.id);
    expect(group.lead).toBe(entry);
    expect(group.entries).toEqual([entry]);
  });
});
