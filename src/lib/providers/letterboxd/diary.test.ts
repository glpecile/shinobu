import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { LetterboxdDeps } from './deps';
import { getDiary, normalizeDiaryItem, parseDiaryFeed } from './diary';

// Two verbatim (whitespace-trimmed) diary <item>s captured from a real RSS feed
// on 2026-07-21 — the field set the parser contracts on. Second item has no
// tmdb:movieId (the edge the parser must still normalize on title+year).
const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org">
<channel>
<title>davidehrlich's films</title>
<item>
  <title>The Dink, 2026 - ★★★</title>
  <link>https://letterboxd.com/davidehrlich/film/the-dink/</link>
  <guid isPermaLink="false">letterboxd-review-1407053961</guid>
  <pubDate>Wed, 22 Jul 2026 04:13:49 +1200</pubDate>
  <letterboxd:watchedDate>2026-07-21</letterboxd:watchedDate>
  <letterboxd:rewatch>No</letterboxd:rewatch>
  <letterboxd:filmTitle>The Dink</letterboxd:filmTitle>
  <letterboxd:filmYear>2026</letterboxd:filmYear>
  <letterboxd:memberRating>3.0</letterboxd:memberRating>
  <tmdb:movieId>1361774</tmdb:movieId>
  <description><![CDATA[ <p><img src="https://a.ltrbxd.com/resized/film-poster/1/2/4/9/4/7/5/1249475-the-dink-0-600-0-900-crop.jpg?v=0f00f70cf0"/></p> <p>Fun.</p> ]]></description>
</item>
<item>
  <title>Obscure Short, 2019</title>
  <link>https://letterboxd.com/davidehrlich/film/obscure-short/</link>
  <guid isPermaLink="false">letterboxd-watch-1400000000</guid>
  <letterboxd:watchedDate>2026-07-20</letterboxd:watchedDate>
  <letterboxd:rewatch>Yes</letterboxd:rewatch>
  <letterboxd:filmTitle>Obscure Short</letterboxd:filmTitle>
  <letterboxd:filmYear>2019</letterboxd:filmYear>
  <description><![CDATA[ <p>No poster.</p> ]]></description>
</item>
</channel>
</rss>`;

// Two logs of the same film on the same day — distinct guids → distinct entries.
const RSS_SAME_FILM_TWICE = `<rss xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org"><channel>
<item><link>https://letterboxd.com/u/film/heat/</link><guid>letterboxd-watch-1</guid><letterboxd:watchedDate>2026-07-19</letterboxd:watchedDate><letterboxd:rewatch>No</letterboxd:rewatch><letterboxd:filmTitle>Heat</letterboxd:filmTitle><letterboxd:filmYear>1995</letterboxd:filmYear><tmdb:movieId>949</tmdb:movieId><description><![CDATA[ ok ]]></description></item>
<item><link>https://letterboxd.com/u/film/heat/</link><guid>letterboxd-watch-2</guid><letterboxd:watchedDate>2026-07-19</letterboxd:watchedDate><letterboxd:rewatch>Yes</letterboxd:rewatch><letterboxd:filmTitle>Heat</letterboxd:filmTitle><letterboxd:filmYear>1995</letterboxd:filmYear><tmdb:movieId>949</tmdb:movieId><description><![CDATA[ ok ]]></description></item>
</channel></rss>`;

function deps(fetchImpl: LetterboxdDeps['fetch'], username = 'davidehrlich'): LetterboxdDeps {
  return { fetch: fetchImpl, username, session: null };
}

describe('parseDiaryFeed', () => {
  test('extracts tmdb id, title, year, diary date, rewatch, and poster', () => {
    const items = parseDiaryFeed(RSS);
    expect(items[0]).toEqual({
      guid: 'letterboxd-review-1407053961',
      slug: 'the-dink',
      title: 'The Dink',
      year: 2026,
      watchedDate: '2026-07-21',
      rewatch: false,
      tmdbId: 1361774,
      posterUrl:
        'https://a.ltrbxd.com/resized/film-poster/1/2/4/9/4/7/5/1249475-the-dink-0-600-0-900-crop.jpg?v=0f00f70cf0',
    });
  });

  test('an item without a tmdb id still parses on title+year', () => {
    const items = parseDiaryFeed(RSS);
    expect(items[1]).toMatchObject({
      slug: 'obscure-short',
      title: 'Obscure Short',
      year: 2019,
      rewatch: true,
    });
    expect(items[1].tmdbId).toBeUndefined();
  });

  test('two logs of one film on one day stay distinct (distinct guids)', () => {
    const items = parseDiaryFeed(RSS_SAME_FILM_TWICE);
    expect(items).toHaveLength(2);
    expect(items[0].guid).not.toBe(items[1].guid);
  });
});

describe('normalizeDiaryItem', () => {
  const FETCHED = '2026-07-21T12:00:00.000Z';

  test('a tmdb-bearing item → date-only MOVIE entry with cross-provider ids', () => {
    const [item] = parseDiaryFeed(RSS);
    const entry = normalizeDiaryItem(item, FETCHED);
    expect(entry).toMatchObject({
      id: 'letterboxd-letterboxd-review-1407053961',
      provider: 'letterboxd',
      watchedAt: '2026-07-21',
      dateOnly: true,
    });
    expect(entry.item).toMatchObject({
      id: 'letterboxd-the-dink',
      type: 'MOVIE',
      externalIds: { letterboxd: 'the-dink', tmdb: 1361774 },
    });
    // The item's own lastUpdated stays a real instant (the injected fetch time).
    expect(entry.item.lastUpdated).toBe(FETCHED);
  });

  test('an item without a tmdb id keeps title+year identity, no tmdb', () => {
    const item = parseDiaryFeed(RSS)[1];
    const entry = normalizeDiaryItem(item, FETCHED);
    expect(entry.item.externalIds.tmdb).toBeUndefined();
    expect(entry.item.externalIds.letterboxd).toBe('obscure-short');
    expect(entry.item.year).toBe(2019);
  });
});

describe('getDiary', () => {
  test('page 1 fetches the RSS feed and normalizes it', async () => {
    const requested: string[] = [];
    const entries = await Effect.runPromise(
      getDiary(
        deps(async (input) => {
          requested.push(String(input));
          return new Response(RSS, { status: 200 });
        }),
        { page: 1 },
      ),
    );
    expect(requested).toEqual(['https://letterboxd.com/davidehrlich/rss/']);
    expect(entries).toHaveLength(2);
    expect(entries[0].provider).toBe('letterboxd');
  });

  test('page 2+ returns [] without a request (RSS is one window)', async () => {
    let called = false;
    const entries = await Effect.runPromise(
      getDiary(
        deps(async () => {
          called = true;
          return new Response(RSS, { status: 200 });
        }),
        { page: 2 },
      ),
    );
    expect(entries).toEqual([]);
    expect(called).toBe(false);
  });

  test('a private/nonexistent profile (404) surfaces a tagged error', async () => {
    const exit = await Effect.runPromiseExit(
      getDiary(
        deps(async () => new Response('', { status: 404 })),
        { page: 1 },
      ),
    );
    expect(exit._tag).toBe('Failure');
  });

  test('a non-feed body (private profile HTML) surfaces a tagged error', async () => {
    const exit = await Effect.runPromiseExit(
      getDiary(
        deps(async () => new Response('<html>Not found</html>', { status: 200 })),
        { page: 1 },
      ),
    );
    expect(exit._tag).toBe('Failure');
  });

  test('a missing username fails as a dead session, never empty-success', async () => {
    const exit = await Effect.runPromiseExit(
      getDiary(deps(async () => new Response(RSS), ''), { page: 1 }),
    );
    expect(exit._tag).toBe('Failure');
  });
});
