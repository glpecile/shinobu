import { expect, test } from 'bun:test';
import * as Effect from 'effect/Effect';

import { matchDiscussionThreads } from '@/lib/http/fourchan';
import type { HttpFetch } from '@/lib/http/types';
import type { NormalizedMediaItem } from '@/types/media';

import { discussionSubreddit, getSubredditSearch, subredditPostUrl } from './reddit';

const item: NormalizedMediaItem = {
  id: 'anilist-1', title: 'Frieren', type: 'ANIME', titles: { romaji: 'Sousou no Frieren' },
  coverImage: '', currentProgress: 0, progressUnit: 'episode', lastUpdated: '', externalIds: {},
};

// Entry shape captured from r/anime/search.rss on 2026-11-01.
const feed = '<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>anime: search results</title>'
  + '<entry><content type="html">&lt;p&gt;Episode 4&lt;/p&gt;</content><id>t3_1xl3wj1</id><link href="https://www.reddit.com/r/anime/comments/1xl3wj1/x/" />'
  + '<title>Sousou no Frieren Season 2 - Episode 5 discussion</title></entry>'
  + '<entry><id>t3_1xl3wj2</id><title>Sousou no Frieren &amp;#39;s Season 2 - Episode 4 discussion</title></entry></feed>';

const feedFetch: HttpFetch = async () => new Response(feed);

test('reads post titles and ids from the feed and links back to the post', async () => {
  const catalog = await Effect.runPromise(getSubredditSearch(feedFetch, 'anime', 'Sousou no Frieren'));
  const [thread] = matchDiscussionThreads(catalog, item, 2, 5);
  expect(thread).toEqual({ id: parseInt('1xl3wj1', 36), title: 'Sousou no Frieren Season 2 - Episode 5 discussion', image: '', episodeSpecific: true });
  expect(subredditPostUrl('anime', thread!.id)).toBe('https://www.reddit.com/r/anime/comments/1xl3wj1');
});

test('rejects rate limits and block pages rather than reporting no posts', async () => {
  for (const response of [new Response('', { status: 429 }), new Response('<body>blocked</body>')]) {
    const fetch: HttpFetch = async () => response;
    await expect(Effect.runPromise(getSubredditSearch(fetch, 'movies', 'Dune'))).rejects.toThrow();
  }
});

test('web uses the same-origin search proxy while native reads Reddit directly', async () => {
  const original = process.env.EXPO_OS;
  try {
    for (const [platform, expectedUrl] of [
      ['web', '/api/reddit/anime/search.rss?q=Sousou%20no%20Frieren'],
      ['ios', 'https://www.reddit.com/r/anime/search.rss?q=Sousou%20no%20Frieren&restrict_sr=on&sort=new&limit=25'],
    ]) {
      process.env.EXPO_OS = platform;
      const fetch: HttpFetch = async (url) => {
        expect(url).toBe(expectedUrl);
        return new Response(feed);
      };
      await Effect.runPromise(getSubredditSearch(fetch, 'anime', 'Sousou no Frieren'));
    }
  } finally {
    if (original == null) delete process.env.EXPO_OS;
    else process.env.EXPO_OS = original;
  }
});

test('searches one subreddit per media kind', () => {
  expect(discussionSubreddit({ ...item, type: 'MOVIE', isFilm: true, externalIds: { anilist: 154587 } })).toBe('anime');
  expect(discussionSubreddit({ ...item, type: 'MOVIE' })).toBe('movies');
  expect(discussionSubreddit({ ...item, type: 'TV' })).toBe('television');
});
