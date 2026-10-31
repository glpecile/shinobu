import { expect, test } from 'bun:test';
import * as Effect from 'effect/Effect';

import type { SerializdDeps } from './deps';
import { getSerializdUpcoming } from './upcoming';

// Trimmed from a live `search/upcoming_episodes_v3` item (2026-10-31).
const item = {
  showId: 259909, showName: 'Dexter: Resurrection', bannerImage: '/banner.jpg',
  season: { seasonNumber: 2, posterPath: '/season.jpg', episodeCount: 0 },
  seasonNumber: 2, episodeNumber: 1, episodeName: 'Risky Business', airDate: '2026-11-01',
  stillPath: '/still.jpg', isPremiere: true, isFinale: false, runtime: null,
  backdrops: [{ file_path: '/backdrop.jpg', width: 3840 }], episodeLog: null,
};

test('reads with the session bearer and normalizes each airing onto its TMDB show', async () => {
  const deps: SerializdDeps = {
    baseUrl: 'https://api.test',
    session: { accessToken: 'tok', username: 'gian' },
    fetch: async (url, init) => {
      if (String(url).endsWith('/validateauthtoken')) return Response.json({ isValid: true, username: 'gian' });
      expect(String(url)).toBe('https://api.test/search/upcoming_episodes_v3');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok');
      return Response.json({ items: [item, { ...item, episodeNumber: 3, episodeName: 'Episode 3' }], nextCursor: null, additionalData: {} });
    },
  };
  const [episode, placeholder] = await Effect.runPromise(getSerializdUpcoming(deps));
  expect(episode).toMatchObject({
    season: 2, number: 1, title: 'Risky Business', airDate: '2026-11-01', isPremiere: true,
    still: 'https://image.tmdb.org/t/p/w780/still.jpg',
    item: { id: 'tmdb-tv-259909', type: 'TV', coverImage: 'https://image.tmdb.org/t/p/w342/season.jpg', externalIds: { tmdb: 259909 } },
  });
  expect(episode).not.toHaveProperty('runtime');
  // TMDB's placeholder name only repeats the episode code.
  expect(placeholder).not.toHaveProperty('title');
});

test('rejects a revoked session before the endpoint can return its editorial fallback', async () => {
  const deps: SerializdDeps = {
    baseUrl: 'https://api.test',
    session: { accessToken: 'revoked', username: 'gian' },
    fetch: async (url) => String(url).endsWith('/validateauthtoken')
      ? Response.json({ isValid: false })
      : Response.json({ items: [item] }),
  };
  const error = await Effect.runPromise(Effect.flip(getSerializdUpcoming(deps)));
  expect(error).toMatchObject({ _tag: 'ProviderAuthError', refreshFailed: true });
});
