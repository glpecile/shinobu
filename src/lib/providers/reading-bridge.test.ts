import { describe, expect, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';

import { bridgeQueries, pickBridgeMatch, showBridgedOnce, type BridgeCandidate } from './reading-bridge';

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
const swordArtOnline: BridgeCandidate = {
  id: 86367,
  format: 'NOVEL',
  volumes: 27,
  titles: ['Sword Art Online'],
  staff: ['Reki Kawahara'],
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

  test('a match by series name alone has no volume number', () => {
    const book = {
      title: 'Sword Art Online Progressive, Vol. 1',
      authors: ['Reki Kawahara'],
      series: { name: 'Sword Art Online' },
    };
    expect(pickBridgeMatch(book, [swordArtOnline])).toEqual({ anilistId: 86367, volume: null });
  });

  test('a special edition matches by title with no volume number', () => {
    const fullmetal = { id: 25, format: 'MANGA', volumes: 27, titles: ['Fullmetal Alchemist'], staff: ['Hiromu Arakawa'] };
    expect(pickBridgeMatch({ title: 'Fullmetal Alchemist: Fullmetal Edition, Vol. 1', authors: ['Hiromu Arakawa'] }, [fullmetal]))
      .toEqual({ anilistId: 25, volume: null });
  });

  test('a volume marker wins over a part marker', () => {
    const jojo = {
      id: 3006,
      format: 'MANGA',
      volumes: 16,
      titles: ['JoJo’s Bizarre Adventure Part 3: Stardust Crusaders'],
      staff: ['Hirohiko Araki'],
    };
    const book = { title: 'JoJo’s Bizarre Adventure Part 3: Stardust Crusaders, Vol. 1', authors: ['Hirohiko Araki'] };
    expect(pickBridgeMatch(book, [jojo])).toEqual({ anilistId: 3006, volume: 1 });
    // Without a volume marker, the arc number is no volume.
    expect(bridgeQueries({ title: 'JoJo’s Bizarre Adventure Part 3: Stardust Crusaders', authors: ['Hirohiko Araki'] }))
      .toEqual([]);
  });

  test('a volume 0 or past the entry’s known count has no volume number', () => {
    for (const part of [0, 3]) {
      expect(pickBridgeMatch({ title: `NISEMONOGATARI, Part ${part} (Light Novel)`, authors: ['NISIOISIN'] }, [nisemonogatari]))
        .toEqual({ anilistId: 143703, volume: null });
    }
  });

  test('a book with no volume marker or format tag searches nothing', () => {
    expect(bridgeQueries({ title: 'Piranesi', authors: ['Susanna Clarke'] })).toEqual([]);
  });
});

// Plan 0117 B6: the lists the app already loads, matched with no request.
function card(overrides: Partial<NormalizedMediaItem> & Pick<NormalizedMediaItem, 'id' | 'title' | 'type'>): NormalizedMediaItem {
  return { coverImage: '', currentProgress: 0, progressUnit: 'chapter', lastUpdated: '', externalIds: {}, ...overrides };
}

describe('showBridgedOnce', () => {
  test('the Hardcover volume carries its AniList entry, which drops out; an entry with no volume stays', () => {
    const entry = card({
      id: 'anilist-143703', title: 'Nisemonogatari', type: 'MANGA', externalIds: { anilist: 143703 },
      readingCredits: { people: ['NISIOISIN'], format: 'NOVEL', volumes: 2 },
    });
    const other = card({
      id: 'anilist-30013', title: 'One Piece', type: 'MANGA', externalIds: { anilist: 30013 },
      readingCredits: { people: ['Eiichirou Oda'], format: 'MANGA' },
    });
    const book = card({
      id: 'hardcover-61', title: 'NISEMONOGATARI, Part 1: Fake Tale (Light Novel)', type: 'BOOK', progressUnit: 'page',
      externalIds: { hardcover: 61 }, readingCredits: { people: ['NISIOISIN', 'VOFAN'] },
    });
    expect(showBridgedOnce([entry, book, other], [entry, other])).toEqual([
      { ...book, externalIds: { hardcover: 61, anilist: 143703 }, anilistVolume: 1 },
      other,
    ]);
  });

  test('a book whose title reads as no volume stays apart, as B5 would', () => {
    const manga = card({
      id: 'anilist-1', title: 'Battle Royale', type: 'MANGA', externalIds: { anilist: 1 },
      readingCredits: { people: ['Koushun Takami'], format: 'MANGA' },
    });
    const novel = card({
      id: 'hardcover-9', title: 'Battle Royale', type: 'BOOK', externalIds: { hardcover: 9 },
      readingCredits: { people: ['Koushun Takami'] },
    });
    expect(showBridgedOnce([manga, novel], [manga])).toEqual([manga, novel]);
  });

  test('the card keeps the newer update of the volume and its entry', () => {
    const entry = card({
      id: 'anilist-143703', title: 'Nisemonogatari', type: 'MANGA', externalIds: { anilist: 143703 }, lastUpdated: '2026-11-18',
      readingCredits: { people: ['NISIOISIN'], format: 'NOVEL', volumes: 2 },
    });
    const book = card({
      id: 'hardcover-61', title: 'NISEMONOGATARI, Part 1 (Light Novel)', type: 'BOOK', lastUpdated: '2025-01-02',
      externalIds: { hardcover: 61 }, readingCredits: { people: ['NISIOISIN'] },
    });
    expect(showBridgedOnce([book, entry], [entry])[0].lastUpdated).toBe('2026-11-18');
  });
});
