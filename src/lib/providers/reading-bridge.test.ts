import { describe, expect, test } from 'bun:test';

import { bridgeQueries, pickBridgeMatch, type BridgeCandidate } from './reading-bridge';

// Shapes from AniList and Hardcover, probed 2026-11-18.
const nisemonogatari: BridgeCandidate = {
  id: 143703,
  format: 'NOVEL',
  volumes: 2,
  titles: ['Nisemonogatari', 'Nisemonogatari: Fake Tale', '偽物語'],
  staff: ['NISIOISIN', 'Ishin Nishio', 'Nisio Isin', 'VOFAN'],
};
const onePiece: BridgeCandidate = {
  id: 30013,
  format: 'MANGA',
  volumes: null,
  titles: ['ONE PIECE', 'One Piece'],
  staff: ['Eiichirou Oda'],
};
const mushokuNovel: BridgeCandidate = {
  id: 85470,
  format: 'NOVEL',
  volumes: 26,
  titles: ['Mushoku Tensei: Isekai Ittara Honki Dasu', 'Mushoku Tensei: Jobless Reincarnation'],
  staff: ['Rifujin na Magonote', 'Sirotaka', 'Shirotaka (シロタカ)'],
};
const mushokuManga: BridgeCandidate = { ...mushokuNovel, id: 85564, format: 'MANGA', volumes: null };
const berserk: BridgeCandidate = {
  id: 30002,
  format: 'MANGA',
  volumes: null,
  titles: ['Berserk'],
  staff: ['Kentarou Miura', 'Kentaro Miura'],
};

describe('pickBridgeMatch', () => {
  test('a light novel volume matches its AniList novel by title and author', () => {
    const book = {
      title: 'NISEMONOGATARI, Part 1: Fake Tale (Light Novel)',
      authors: ['NISIOISIN', 'VOFAN'],
      series: { name: 'Monogatari (Light Novel)', position: 5 },
    };
    expect(bridgeQueries(book)).toEqual(['NISEMONOGATARI', 'Monogatari']);
    expect(pickBridgeMatch(book, [nisemonogatari])).toEqual({ anilistId: 143703, volume: 1 });
  });

  test('names fold long vowels and the marker can follow the subtitle', () => {
    expect(pickBridgeMatch({ title: 'One Piece, Vol. 3: Don’t Get Fooled Again', authors: ['Eiichiro Oda'] }, [onePiece]))
      .toEqual({ anilistId: 30013, volume: 3 });
    expect(pickBridgeMatch({ title: 'NISEMONOGATARI: Fake Tale, Part 2', authors: ['NISIOISIN'] }, [nisemonogatari]))
      .toEqual({ anilistId: 143703, volume: 2 });
  });

  test('a title without a staff match is no match', () => {
    expect(pickBridgeMatch({ title: 'One Piece, Vol. 1', authors: ['Someone Else'] }, [onePiece])).toBeNull();
  });

  test('a staff match without an equal title is no match', () => {
    expect(pickBridgeMatch({ title: 'One Piece Party, Vol. 1', authors: ['Eiichiro Oda'] }, [onePiece])).toBeNull();
  });

  test('the format tag picks the novel over the manga of the same name', () => {
    const book = { title: 'Mushoku Tensei: Jobless Reincarnation (Light Novel), Vol. 4', authors: ['Rifujin na Magonote'] };
    expect(pickBridgeMatch(book, [mushokuManga, mushokuNovel])).toEqual({ anilistId: 85470, volume: 4 });
  });

  test('two entries that both match are no match', () => {
    const book = { title: 'Mushoku Tensei: Jobless Reincarnation, Vol. 4', authors: ['Rifujin na Magonote'] };
    expect(pickBridgeMatch(book, [mushokuManga, mushokuNovel])).toBeNull();
  });

  test('an omnibus matches with no volume number', () => {
    const book = {
      title: 'Berserk Deluxe Edition Volume 1',
      authors: ['Kentaro Miura'],
      series: { name: 'Berserk', position: 1 },
    };
    expect(pickBridgeMatch(book, [berserk])).toEqual({ anilistId: 30002, volume: null });
  });

  test('a volume past the entry’s known count has no volume number', () => {
    expect(pickBridgeMatch({ title: 'NISEMONOGATARI, Part 3 (Light Novel)', authors: ['NISIOISIN'] }, [nisemonogatari]))
      .toEqual({ anilistId: 143703, volume: null });
  });
});
