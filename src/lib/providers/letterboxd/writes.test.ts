import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

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

// A trimmed film page carrying the LID the diary API keys on. The LID lives in
// the entity-encoded `production:identifier` meta
// (docs/solutions/letterboxd-no-api-fallback.md).
const FILM_PAGE = `<html><head><meta name="production:identifier" content="{&quot;lid&quot;:&quot;UH8e&quot;,&quot;uid&quot;:&quot;film:1234878&quot;}"></head><body></body></html>`;

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
 * Fakes the two transports the write uses: `fetch` for public film-page
 * resolution, and `webFetch` for the authenticated diary write that (on device)
 * navigates to the film page and submits its form inside the login WebView.
 * Records the request so tests can assert what the write drives.
 */
function fakeDeps(options: {
  filmPageStatus?: number;
  webResponse?: LetterboxdWebResponse;
  session?: LetterboxdSession | null;
  withWebFetch?: boolean;
  onWrite?: (request: LetterboxdWebRequest) => void;
}): LetterboxdDeps {
  const withWebFetch = options.withWebFetch ?? true;
  return {
    username: 'gian',
    session: options.session === undefined ? SESSION : options.session,
    fetch: async () => new Response(FILM_PAGE, { status: options.filmPageStatus ?? 200 }),
    webFetch: withWebFetch
      ? async (request) => {
          options.onWrite?.(request);
          return options.webResponse ?? { status: 200, body: '{"result":true}' };
        }
      : undefined,
  };
}

describe('logToLetterboxd', () => {
  test('navigates to the film page and drives the diary write in the WebView', async () => {
    let captured: LetterboxdWebRequest | undefined;
    const deps = fakeDeps({ onWrite: (r) => (captured = r) });

    await Effect.runPromise(
      logToLetterboxd(deps, movie({ letterboxd: 'tuner' }), {
        watchedAt: '2026-07-15T20:00:00.000Z',
        tags: ['rewatch-night', ' imax '],
      }),
    );

    expect(captured?.filmPath).toBe('/film/tuner/');
    // The film is identified by its LID (productionId) for the /api/v0 write.
    expect(captured?.filmLid).toBe('UH8e');
    expect(captured?.viewingDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Tags are trimmed into a string array.
    expect(captured?.tags).toEqual(['rewatch-night', 'imax']);
  });

  test('resolves via the /tmdb/ redirect when there is no Letterboxd slug', async () => {
    let captured: LetterboxdWebRequest | undefined;
    const deps = fakeDeps({ onWrite: (r) => (captured = r) });

    await Effect.runPromise(logToLetterboxd(deps, movie({ tmdb: 999 })));

    expect(captured?.filmPath).toBe('/tmdb/999/');
    expect(captured?.filmLid).toBe('UH8e');
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
  });

  test('fails as a dead session when no web login was captured', async () => {
    const deps = fakeDeps({ session: null });
    const outcome = await Effect.runPromise(
      Effect.flip(logToLetterboxd(deps, movie({ letterboxd: 'tuner' }))),
    );
    expect(outcome._tag).toBe('ProviderAuthError');
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
