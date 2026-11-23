import { expect, test } from 'bun:test';
import * as Effect from 'effect/Effect';

import type { NormalizedMediaItem } from '@/types/media';
import type { SerializdDeps } from './deps';
import { getSerializdTrackingLists, serializdTrackingState, setSerializdTrackingStatus } from './tracking';

const session = { accessToken: 'tok', username: 'gian' };
const item = { title: 'Breaking Bad', externalIds: { tmdb: 1396 } } as NormalizedMediaItem;

test('a watching show is added to Paused and leaves Currently Watching, and an untracked one is a skip', async () => {
  const calls: Array<[string, unknown]> = [];
  const deps: SerializdDeps = {
    session, baseUrl: 'https://api.test',
    fetch: async (url, init) => {
      calls.push([String(url), JSON.parse(String(init?.body))]);
      // A 2xx without JSON is still a success.
      return new Response('');
    },
  };
  const paused = await Effect.runPromise(setSerializdTrackingStatus(deps, item, 'watching', 'paused'));
  const skipped = await Effect.runPromise(setSerializdTrackingStatus(deps, item, null, 'dropped'));

  expect(paused).toEqual({ status: 'ok' });
  expect(calls).toEqual([
    ['https://api.test/paused_shows', { show_id: 1396 }],
    ['https://api.test/currently_watching/remove', { show_id: 1396 }],
  ]);
  expect(skipped).toEqual({ status: 'skipped', reason: 'not in your Serializd library' });
});

test('a status comes from every page of the three lists, then from watched seasons', async () => {
  const calls: string[] = [];
  const lists = await Effect.runPromise(getSerializdTrackingLists({
    session, baseUrl: 'https://api.test',
    fetch: async (url) => {
      const path = new URL(String(url)).pathname + new URL(String(url)).search;
      calls.push(path);
      if (path.startsWith('/user/gian/dropped_shows_page/')) {
        return Response.json({ totalPages: 2, items: [{ showId: path.includes('/2?') ? 7 : 6 }] });
      }
      return Response.json({ totalPages: 1, items: [] });
    },
  }));

  expect(calls.toSorted()).toEqual([
    '/user/gian/currently_watching_page/1?sort_by=date_added_desc',
    '/user/gian/dropped_shows_page/1?sort_by=date_added_desc',
    '/user/gian/dropped_shows_page/2?sort_by=date_added_desc',
    '/user/gian/paused_shows_page/1?sort_by=date_added_desc',
  ]);
  expect(serializdTrackingState(lists, 7, true)).toBe('dropped');
  expect(serializdTrackingState(lists, 8, true)).toBe('watched');
  expect(serializdTrackingState(lists, 8, false)).toBeNull();
});
