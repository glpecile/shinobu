import * as Effect from 'effect/Effect';

import { plainText } from '@/lib/http/fourchan';
import type { HttpFetch } from '@/lib/http/types';
import type { NormalizedMediaItem } from '@/types/media';

export type DiscussionSubreddit = 'anime' | 'movies' | 'television';

/**
 * One subreddit per item: logged-out Reddit allows about one search a minute
 * per IP (`docs/solutions/reddit-logged-out-json-blocked.md`).
 */
export function discussionSubreddit(item: NormalizedMediaItem): DiscussionSubreddit {
  if (item.type === 'ANIME' || item.externalIds.anilist != null || item.externalIds.mal != null) return 'anime';
  return item.type === 'MOVIE' || item.isFilm === true ? 'movies' : 'television';
}

/** r/anime discussion threads are titled in romaji. */
export function subredditSearchTerm(item: NormalizedMediaItem, subreddit: DiscussionSubreddit): string {
  return (subreddit === 'anime' ? item.titles?.romaji : undefined) ?? item.title;
}

export function subredditPostUrl(subreddit: DiscussionSubreddit, id: number): string {
  return `https://www.reddit.com/r/${subreddit}/comments/${id.toString(36)}`;
}

/**
 * Reads the Atom search feed, the only logged-out Reddit read left. Posts carry
 * no spoiler flag, so thumbnails are never shown. Base-36 post ids become
 * numbers so the 4chan matcher sorts them newest first.
 */
export const getSubredditSearch = Effect.fn('getSubredditSearch')(function*(
  fetch: HttpFetch,
  subreddit: DiscussionSubreddit,
  term: string,
) {
  const q = encodeURIComponent(term);
  const feed = yield* Effect.tryPromise({
    try: async (signal) => {
      const url = process.env.EXPO_OS === 'web'
        ? `/api/reddit/${subreddit}/search.rss?q=${q}`
        : `https://www.reddit.com/r/${subreddit}/search.rss?q=${q}&restrict_sr=on&sort=new&limit=25`;
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Reddit search: ${response.status}`);
      const text = await response.text();
      if (!text.includes('<feed')) throw new Error('Reddit search: not a feed');
      return text;
    },
    catch: (cause) => new Error('Could not load Reddit search', { cause }),
  });
  return [...feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].flatMap(([, entry]) => {
    const id = /<id>t3_([a-z0-9]+)<\/id>/.exec(entry)?.[1];
    const title = /<title>([\s\S]*?)<\/title>/.exec(entry)?.[1];
    return id == null || title == null ? [] : [{ id: parseInt(id, 36), subject: plainText(title), opening: '' }];
  });
});
