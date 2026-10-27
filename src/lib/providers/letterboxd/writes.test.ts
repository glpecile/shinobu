import { describe, expect, test } from 'bun:test';
import * as Effect from 'effect/Effect';

import type { NormalizedMediaItem } from '@/types/media';
import type {
  LetterboxdDeps,
  LetterboxdSession,
  LetterboxdWebRequest,
  LetterboxdWebResponse,
} from './deps';
import { logToLetterboxd } from './writes';

const SESSION: LetterboxdSession = {
  cookie: 'letterboxd.signed.in.as=gian; com.xk72.webparts.csrf=csrf-token-123',
  csrf: 'csrf-token-123',
};

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

/**
 * Fakes `webFetch`, the authenticated diary write that (on device) loads the
 * film page and posts inside the login WebView. `fetch` throws: the WebView
 * reads the LID itself, so a write never downloads the film page first.
 */
function fakeDeps(options: {
  webResponse?: LetterboxdWebResponse;
  withWebFetch?: boolean;
  onWrite?: (request: LetterboxdWebRequest) => void;
}): LetterboxdDeps {
  const withWebFetch = options.withWebFetch ?? true;
  return {
    username: 'gian',
    session: SESSION,
    fetch: async () => { throw new Error('Native writes must not fetch the film page'); },
    webFetch: withWebFetch
      ? async (request) => {
          options.onWrite?.(request);
          return options.webResponse ?? { status: 200, body: '{"result":true}' };
        }
      : undefined,
  };
}

describe('logToLetterboxd', () => {
  test('logs through a userscript without captured cookies or a CORS-blocked film fetch', async () => {
    let captured: LetterboxdWebRequest | undefined;
    const deps: LetterboxdDeps = {
      username: 'gian',
      fetch: async () => { throw new Error('Web film fetch must not run'); },
      userscriptFetch: async (request) => {
        captured = request;
        return { status: 200, body: '{"logEntry":{"id":"abc"}}' };
      },
    };
    await Effect.runPromise(logToLetterboxd(deps, movie({ tmdb: 999 }), { tags: ['spike'], liked: true }));
    expect(captured?.filmPath).toBe('/tmdb/999/');
    expect(captured?.tags).toEqual(['spike']);
    expect(captured?.liked).toBe(true);
  });
  test('navigates to the film page and drives the diary write in the WebView', async () => {
    let captured: LetterboxdWebRequest | undefined;
    const deps = fakeDeps({ onWrite: (r) => (captured = r) });

    await Effect.runPromise(
      logToLetterboxd(deps, movie({ letterboxd: 'tuner' }), {
        watchedAt: '2026-07-15T20:00:00.000Z',
        tags: ['rewatch-night', ' imax '],
        liked: true,
      }),
    );

    expect(captured?.filmPath).toBe('/film/tuner/');
    expect(captured?.viewingDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Tags are trimmed into a string array.
    expect(captured?.tags).toEqual(['rewatch-night', 'imax']);
    expect(captured?.liked).toBe(true);
  });

  test('resolves via the /tmdb/ redirect when there is no Letterboxd slug', async () => {
    let captured: LetterboxdWebRequest | undefined;
    const deps = fakeDeps({ onWrite: (r) => (captured = r) });

    await Effect.runPromise(logToLetterboxd(deps, movie({ tmdb: 999 })));

    expect(captured?.filmPath).toBe('/tmdb/999/');
  });

  test('reports a TMDB id Letterboxd has no film for, not a dead session', async () => {
    const deps = fakeDeps({ webResponse: { status: 0, body: 'no-production-lid' } });
    const outcome = await Effect.runPromise(
      Effect.flip(logToLetterboxd(deps, movie({ tmdb: 999 }))),
    );
    expect(outcome._tag).toBe('ProviderDecodeError');
    expect((outcome as { detail: string }).detail).toContain('/tmdb/999/');
  });

  test('reports a Cloudflare challenge as a non-retryable failure, not a dead session', async () => {
    const deps = fakeDeps({ webResponse: { status: 0, body: 'challenge' } });
    const outcome = await Effect.runPromise(
      Effect.flip(logToLetterboxd(deps, movie({ letterboxd: 'parasite-2019' }))),
    );
    expect(outcome).toMatchObject({ _tag: 'ProviderNetworkError', status: 403, retryable: false });
  });

  test('marks a parity rewatch', async () => {
    let captured: LetterboxdWebRequest | undefined;
    const deps = fakeDeps({ onWrite: (r) => (captured = r) });

    await Effect.runPromise(
      logToLetterboxd(deps, movie({ letterboxd: 'tuner' }), { rewatch: true }),
    );

    expect(captured?.rewatch).toBe(true);
  });

  test('does not mark a rewatch by default', async () => {
    let captured: LetterboxdWebRequest | undefined;
    const deps = fakeDeps({ onWrite: (r) => (captured = r) });

    await Effect.runPromise(logToLetterboxd(deps, movie({ letterboxd: 'tuner' })));

    expect(captured?.rewatch).toBe(false);
    expect(captured?.liked).toBe(false);
  });

  test('fails as a dead session when the WebView write transport is absent (web)', async () => {
    const deps = fakeDeps({ withWebFetch: false });
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

  test('maps a 200 carrying an Error message to a decode error with the message', async () => {
    const deps = fakeDeps({
      webResponse: {
        status: 200,
        body: '{"messages":[{"type":"Error","title":"Already logged"}]}',
      },
    });
    const outcome = await Effect.runPromise(
      Effect.flip(logToLetterboxd(deps, movie({ letterboxd: 'tuner' }))),
    );
    expect(outcome._tag).toBe('ProviderDecodeError');
    expect((outcome as { detail: string }).detail).toContain('Already logged');
  });

  test('maps a 400 validation body to a decode error with the message', async () => {
    const deps = fakeDeps({
      webResponse: {
        status: 400,
        body: '{"messages":[{"type":"Error","title":"Invalid production"}]}',
      },
    });
    const outcome = await Effect.runPromise(
      Effect.flip(logToLetterboxd(deps, movie({ letterboxd: 'tuner' }))),
    );
    expect(outcome._tag).toBe('ProviderDecodeError');
    expect((outcome as { detail: string }).detail).toContain('Invalid production');
  });

  test('maps a 403 (expired session / CSRF) to a dead-session auth error', async () => {
    const deps = fakeDeps({ webResponse: { status: 403, body: '' } });
    const outcome = await Effect.runPromise(
      Effect.flip(logToLetterboxd(deps, movie({ letterboxd: 'tuner' }))),
    );
    expect(outcome._tag).toBe('ProviderAuthError');
  });

  test('treats an HTML (non-JSON) save response as a dead session', async () => {
    const deps = fakeDeps({
      webResponse: { status: 200, body: '<html>Sign in</html>' },
    });
    const outcome = await Effect.runPromise(
      Effect.flip(logToLetterboxd(deps, movie({ letterboxd: 'tuner' }))),
    );
    expect(outcome._tag).toBe('ProviderAuthError');
  });
});
