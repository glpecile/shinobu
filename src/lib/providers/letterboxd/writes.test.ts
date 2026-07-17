import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { NormalizedMediaItem } from '@/types/media';
import type { LetterboxdDeps, LetterboxdSession } from './deps';
import { logToLetterboxd } from './writes';

const SESSION: LetterboxdSession = {
  cookie: 'letterboxd.signed.in.as=gian; com.xk72.webparts.csrf=csrf-token-123',
  csrf: 'csrf-token-123',
};

// A trimmed film page carrying the id the diary endpoint keys on. Real pages
// have no `data-film-id` — the id lives in `data-production-uid="film:N"`
// (docs/solutions/letterboxd-no-api-fallback.md).
const FILM_PAGE = `<html><body><div id="backdrop" data-production-uid="film:1234878"></div></body></html>`;

function movie(externalIds: NormalizedMediaItem['externalIds']): NormalizedMediaItem {
  return {
    id: 'letterboxd-tuner',
    title: 'Tuner',
    coverImage: '',
    year: 2025,
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-16T00:00:00.000Z',
    externalIds,
  };
}

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: URLSearchParams;
}

/**
 * Routes GETs (film-page resolution) and the diary POST, recording the POST so
 * tests can assert the exact request the signed-in web user would send.
 */
function fakeDeps(options: {
  filmPageStatus?: number;
  saveResponse?: Response;
  session?: LetterboxdSession | null;
  onPost?: (captured: Captured) => void;
}): LetterboxdDeps {
  return {
    username: 'gian',
    session: options.session === undefined ? SESSION : options.session,
    fetch: async (input, init) => {
      const url = String(input);
      if (init?.method === 'POST') {
        options.onPost?.({
          url,
          method: init.method,
          headers: (init.headers ?? {}) as Record<string, string>,
          body: new URLSearchParams(String(init.body)),
        });
        return options.saveResponse ?? new Response('{"result":true}', { status: 200 });
      }
      return new Response(FILM_PAGE, { status: options.filmPageStatus ?? 200 });
    },
  };
}

describe('logToLetterboxd', () => {
  test('resolves the film id from the slug and posts a diary entry', async () => {
    let captured: Captured | undefined;
    const deps = fakeDeps({ onPost: (c) => (captured = c) });

    await Effect.runPromise(
      logToLetterboxd(deps, movie({ letterboxd: 'tuner' }), {
        watchedAt: '2026-07-15T20:00:00.000Z',
        tags: ['rewatch-night', ' imax '],
      }),
    );

    expect(captured?.url).toBe('https://letterboxd.com/s/save-diary-entry');
    expect(captured?.headers.Cookie).toBe(SESSION.cookie);
    expect(captured?.headers['X-Requested-With']).toBe('XMLHttpRequest');
    expect(captured?.body.get('__csrf')).toBe('csrf-token-123');
    // The film is identified by viewingableUid=film:{id}, not a `filmId` field.
    expect(captured?.body.get('viewingableUid')).toBe('film:1234878');
    expect(captured?.body.get('filmId')).toBeNull();
    expect(captured?.body.get('specifiedDate')).toBe('true');
    expect(captured?.body.get('viewingDateStr')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Tags are trimmed and sent as one comma-separated `tags` field.
    expect(captured?.body.get('tags')).toBe('rewatch-night, imax');
  });

  test('resolves via the /tmdb/ redirect when there is no Letterboxd slug', async () => {
    let captured: Captured | undefined;
    const deps = fakeDeps({ onPost: (c) => (captured = c) });

    await Effect.runPromise(logToLetterboxd(deps, movie({ tmdb: 999 })));

    expect(captured?.body.get('viewingableUid')).toBe('film:1234878');
  });

  test('marks a parity rewatch', async () => {
    let captured: Captured | undefined;
    const deps = fakeDeps({ onPost: (c) => (captured = c) });

    await Effect.runPromise(
      logToLetterboxd(deps, movie({ letterboxd: 'tuner' }), { rewatch: true }),
    );

    expect(captured?.body.get('rewatch')).toBe('true');
  });

  test('fails as a dead session when no web login was captured', async () => {
    const deps = fakeDeps({ session: null });
    const outcome = await Effect.runPromise(
      Effect.flip(logToLetterboxd(deps, movie({ letterboxd: 'tuner' }))),
    );
    expect(outcome._tag).toBe('ProviderAuthError');
  });

  test('fails when the item has no slug or tmdb id to resolve', async () => {
    const deps = fakeDeps({});
    const outcome = await Effect.runPromise(
      Effect.flip(logToLetterboxd(deps, movie({ trakt: 42 }))),
    );
    expect(outcome._tag).toBe('ProviderDecodeError');
  });

  test('maps a rejected entry (result:false) to a decode error with the message', async () => {
    const deps = fakeDeps({
      saveResponse: new Response('{"result":false,"messages":["Already logged"]}', {
        status: 200,
      }),
    });
    const outcome = await Effect.runPromise(
      Effect.flip(logToLetterboxd(deps, movie({ letterboxd: 'tuner' }))),
    );
    expect(outcome._tag).toBe('ProviderDecodeError');
    expect((outcome as { detail: string }).detail).toContain('Already logged');
  });

  test('maps a 403 (expired session / CSRF) to a dead-session auth error', async () => {
    const deps = fakeDeps({ saveResponse: new Response('', { status: 403 }) });
    const outcome = await Effect.runPromise(
      Effect.flip(logToLetterboxd(deps, movie({ letterboxd: 'tuner' }))),
    );
    expect(outcome._tag).toBe('ProviderAuthError');
  });

  test('treats an HTML (non-JSON) save response as a dead session', async () => {
    const deps = fakeDeps({
      saveResponse: new Response('<html>Sign in</html>', { status: 200 }),
    });
    const outcome = await Effect.runPromise(
      Effect.flip(logToLetterboxd(deps, movie({ letterboxd: 'tuner' }))),
    );
    expect(outcome._tag).toBe('ProviderAuthError');
  });
});
