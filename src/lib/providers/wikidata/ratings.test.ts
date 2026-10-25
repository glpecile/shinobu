import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import { getWikidataRatings } from './ratings';

const wd = (id: string) => ({ value: `http://www.wikidata.org/entity/${id}` });
const row = (score: string, source: string, method: string, date: string) => ({
  score: { value: score },
  source: wd(source),
  method: wd(method),
  date: { value: `${date}T00:00:00Z` },
  rt: { value: 'm/inception' },
  mc: { value: 'movie/inception' },
});

function respond(bindings: unknown[], onUrl: (query: string) => void = () => {}) {
  return {
    fetch: async (url: RequestInfo | URL) => {
      onUrl(new URL(String(url)).searchParams.get('query') ?? '');
      return new Response(JSON.stringify({ results: { bindings } }));
    },
  };
}

describe('getWikidataRatings', () => {
  test('keeps the newest Tomatometer and Metascore, with their dates and page ids', async () => {
    const ratings = await Effect.runPromise(getWikidataRatings(respond([
      row('86%', 'Q105584', 'Q108403393', '2020-01-01'),
      row('87%', 'Q105584', 'Q108403393', '2022-11-29'),
      // Rotten Tomatoes' average rating, newer but not the Tomatometer.
      row('8.1/10', 'Q105584', 'Q108403540', '2023-09-04'),
      row('74/100', 'Q150248', 'Q106515043', '2025-06-16'),
      // IMDb is recorded too; Simkl is where its score comes from.
      row('8.8/10', 'Q37312', 'Q107218751', '2026-02-21'),
    ], (query) => {
      expect(query).toContain('(wdt:P4947 "27205")');
      expect(query).not.toContain('P4086');
    }), { tmdb: { kind: 'movie', id: 27205 }, mal: 1 }));

    expect(ratings).toEqual([
      { source: 'rottenTomatoes', value: 87, scale: '%', asOf: '2022-11-29', pageId: 'm/inception' },
      { source: 'metacritic', value: 74, scale: 100, asOf: '2025-06-16', pageId: 'movie/inception' },
    ]);
  });

  test('anime without a TMDB id looks up by MAL and AniList, and no scores is an empty list', async () => {
    const ratings = await Effect.runPromise(getWikidataRatings(respond([], (query) => {
      expect(query).toContain('(wdt:P4086 "52991") (wdt:P8729 "154587")');
    }), { mal: 52991, anilist: 154587 }));

    expect(ratings).toEqual([]);
  });
});
