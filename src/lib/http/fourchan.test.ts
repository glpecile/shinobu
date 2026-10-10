import { expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { HttpFetch } from '@/lib/http/types';
import type { NormalizedMediaItem } from '@/types/media';

import { getDiscussionCatalog, matchDiscussionThreads } from './fourchan';

const item: NormalizedMediaItem = {
  id: 'anilist-1', title: "The World's Strongest Witch", type: 'ANIME',
  titles: { romaji: 'Sekai Saikyou no Majo, Hajimemashita' },
  coverImage: '', currentProgress: 0, progressUnit: 'episode', lastUpdated: '', externalIds: {},
};

// Opening-post fields captured from /a/thread/291481805 on 2026-10-09.
const exampleFetch: HttpFetch = async () => new Response(JSON.stringify([{ threads: [{
    no: 291481805,
    sub: 'Sekai Saikyou no Majo, Hajimemashita / The World&#039;s Strongest Witch',
    com: 'What a great first episode.',
    tim: 1791440116967699,
}] }]));

test('finds the supplied live thread through either title without claiming an episode number', async () => {
  const catalog = await Effect.runPromise(getDiscussionCatalog(exampleFetch, 'a'));
  for (const title of [item.title, item.titles!.romaji!]) {
    expect(matchDiscussionThreads(catalog, { ...item, title, titles: {} }, 1, 1))
      .toEqual([{
        id: 291481805, episodeSpecific: false,
        title: "Sekai Saikyou no Majo, Hajimemashita / The World's Strongest Witch",
        image: 'https://i.4cdn.org/a/1791440116967699s.jpg',
      }]);
  }
});

test('filters explicit episode/season mismatches and title substrings but keeps general discussions', () => {
  const show = { ...item, title: 'Arcane', titles: {} };
  expect(matchDiscussionThreads([
    { id: 1, subject: 'Arcane S02E03', opening: '' },
    { id: 2, subject: 'Arcane episode 03', opening: '' },
    { id: 3, subject: 'Arcane S01E03', opening: '' },
    { id: 4, subject: 'Arcane ep. 4', opening: '' },
    { id: 5, subject: 'Arcanely unrelated episode 3', opening: '' },
    { id: 6, subject: 'General', opening: '<b>ARCANE</b> discussion' },
  ], show, 2, 3)).toEqual([
    { id: 6, title: 'General', image: '', episodeSpecific: false },
    { id: 2, title: 'Arcane episode 03', image: '', episodeSpecific: true },
    { id: 1, title: 'Arcane S02E03', image: '', episodeSpecific: true },
  ]);
});

test('rejects unavailable or malformed catalogs rather than reporting no matching threads', async () => {
  for (const response of [new Response('', { status: 503 }), new Response('[{"threads":[{"no":"bad"}]}]')]) {
    const fetch: HttpFetch = async () => response;
    await expect(Effect.runPromise(getDiscussionCatalog(fetch, 'co'))).rejects.toThrow();
  }
});

test('web uses the same-origin catalog proxy while native keeps the direct API', async () => {
  const original = process.env.EXPO_OS;
  try {
    for (const [platform, expectedUrl] of [
      ['web', '/api/fourchan/a/catalog.json'],
      ['ios', 'https://a.4cdn.org/a/catalog.json'],
    ]) {
      process.env.EXPO_OS = platform;
      const fetch: HttpFetch = async (url) => {
        expect(url).toBe(expectedUrl);
        return exampleFetch(url);
      };
      const catalog = await Effect.runPromise(getDiscussionCatalog(fetch, 'a'));
      expect(catalog[0]?.id).toBe(291481805);
    }
  } finally {
    if (original == null) delete process.env.EXPO_OS;
    else process.env.EXPO_OS = original;
  }
});

test('matches known aliases and contextual initials, not incidental acronyms', () => {
  const show = { ...item, title: 'Attack on Titan', titles: {}, titleAliases: ['Shingeki no Kyojin'] };
  const catalog = [
    { id: 1, subject: 'Shingeki no Kyojin', opening: '' },
    { id: 2, subject: '/aot/ general', opening: '' },
    { id: 3, subject: 'AOT episode 2', opening: '' },
    { id: 4, subject: 'AOT soundtrack', opening: '' },
    { id: 5, subject: 'Other discussion', opening: 'AOT' },
    { id: 6, subject: 'Attack on Titan general', opening: '' },
    { id: 7, subject: 'Shingeki no Kyojin discussion', opening: '' },
    { id: 8, subject: '/aot/ thread', opening: '' },
  ];
  expect(matchDiscussionThreads(catalog, show, 1, 1).map((thread) => thread.id)).toEqual([8, 7, 6, 2, 1]);
  expect(matchDiscussionThreads(catalog, { ...show, type: 'MOVIE' }).map((thread) => thread.id)).toEqual([8, 7, 6, 3, 2, 1]);
});

test('includes horror generals only for horror media without applying episode filters to them', () => {
  const catalog = [
    { id: 1, subject: 'Horror general', opening: 'Discuss episode 9 here' },
    { id: 2, subject: '/hsg/ - Horror & Supernatural General', opening: '' },
    { id: 3, subject: 'Horror movies discussion', opening: '' },
    { id: 4, subject: 'Other discussion', opening: 'Horror general' },
    { id: 5, subject: 'Alien horror thread', opening: '' },
    { id: 6, subject: 'Test series episode 9', opening: '' },
  ];
  const show = { ...item, title: 'Test series', titles: {}, type: 'TV' as const, genres: ['horror'] };
  expect(matchDiscussionThreads(catalog, show, 1, 2).map(({ id, episodeSpecific }) => ({ id, episodeSpecific })))
    .toEqual([3, 2, 1].map((id) => ({ id, episodeSpecific: false })));
  expect(matchDiscussionThreads(catalog, { ...show, type: 'MOVIE' }).map(({ id }) => id)).toEqual([6, 3, 2, 1]);
  expect(matchDiscussionThreads(catalog, { ...show, genres: ['Drama'] }, 1, 2)).toEqual([]);
});

test('does not expose spoiler-marked or deleted opening-post thumbnails', async () => {
  const response = new Response(JSON.stringify([{ threads: [
    { no: 1, tim: 123, spoiler: 1 },
    { no: 2, tim: 456, filedeleted: 1 },
    { no: 3 },
  ] }]));
  const fetch: HttpFetch = async () => response;
  const catalog = await Effect.runPromise(getDiscussionCatalog(fetch, 'a'));
  expect(catalog.map((thread) => thread.image)).toEqual(['', '', '']);
});
