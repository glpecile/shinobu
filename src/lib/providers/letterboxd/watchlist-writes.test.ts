import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { NormalizedMediaItem } from '@/types/media';
import type {
  LetterboxdDeps,
  LetterboxdSession,
  LetterboxdWatchlistWebRequest,
  LetterboxdWebResponse,
} from './deps';
import {
  addToLetterboxdWatchlist,
  removeFromLetterboxdWatchlist,
} from './watchlist-writes';

const SESSION: LetterboxdSession = {
  cookie: 'letterboxd.signed.in.as=gian; com.xk72.webparts.csrf=csrf-token-123',
  csrf: 'csrf-token-123',
};

// A trimmed film page carrying the LID the watchlist API keys on — same
// entity-encoded `production:identifier` meta the diary write reads.
const FILM_PAGE = `<html><head><meta name="production:identifier" content="{&quot;lid&quot;:&quot;294O&quot;,&quot;uid&quot;:&quot;film:51155&quot;}"></head><body></body></html>`;

function movie(externalIds: NormalizedMediaItem['externalIds']): NormalizedMediaItem {
  return {
    id: 'letterboxd-the-thing',
    title: 'The Thing',
    coverImage: '',
    year: 1982,
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-29T00:00:00.000Z',
    externalIds,
  };
}

function fakeDeps(options: {
  webResponse?: LetterboxdWebResponse;
  session?: LetterboxdSession | null;
  withTransport?: boolean;
  onWrite?: (request: LetterboxdWatchlistWebRequest) => void;
}): LetterboxdDeps {
  const withTransport = options.withTransport ?? true;
  return {
    username: 'gian',
    session: options.session === undefined ? SESSION : options.session,
    fetch: async () => new Response(FILM_PAGE, { status: 200 }),
    watchlistWebFetch: withTransport
      ? async (request) => {
          options.onWrite?.(request);
          return options.webResponse ?? { status: 204, body: '' };
        }
      : undefined,
  };
}

describe('setLetterboxdWatchlist (plan 0033 R3/R4)', () => {
  test('the add navigates to the film page and PATCHes inWatchlist: true', async () => {
    let captured: LetterboxdWatchlistWebRequest | undefined;
    const deps = fakeDeps({ onWrite: (r) => (captured = r) });

    await Effect.runPromise(
      addToLetterboxdWatchlist(deps, movie({ letterboxd: 'the-thing' })),
    );

    expect(captured?.filmPath).toBe('/film/the-thing/');
    expect(captured?.filmLid).toBe('294O');
    expect(captured?.inWatchlist).toBe(true);
  });

  test('the remove PATCHes inWatchlist: false — a state set, never a toggle', async () => {
    let captured: LetterboxdWatchlistWebRequest | undefined;
    const deps = fakeDeps({ onWrite: (r) => (captured = r) });

    await Effect.runPromise(
      removeFromLetterboxdWatchlist(deps, movie({ letterboxd: 'the-thing' })),
    );

    expect(captured?.inWatchlist).toBe(false);
  });

  test('resolves via the /tmdb/ redirect when there is no Letterboxd slug', async () => {
    let captured: LetterboxdWatchlistWebRequest | undefined;
    const deps = fakeDeps({ onWrite: (r) => (captured = r) });

    await Effect.runPromise(addToLetterboxdWatchlist(deps, movie({ tmdb: 999 })));

    expect(captured?.filmPath).toBe('/tmdb/999/');
    expect(captured?.filmLid).toBe('294O');
  });

  test('fails as a dead session when no web login was captured', async () => {
    const deps = fakeDeps({ session: null });
    const outcome = await Effect.runPromise(
      Effect.flip(addToLetterboxdWatchlist(deps, movie({ letterboxd: 'the-thing' }))),
    );
    expect(outcome._tag).toBe('ProviderAuthError');
  });

  test('fails as a dead session when the transport is absent (web)', async () => {
    const deps = fakeDeps({ withTransport: false });
    const outcome = await Effect.runPromise(
      Effect.flip(addToLetterboxdWatchlist(deps, movie({ letterboxd: 'the-thing' }))),
    );
    expect(outcome._tag).toBe('ProviderAuthError');
  });

  test('fails when the item has no slug or tmdb id to resolve', async () => {
    const deps = fakeDeps({});
    const outcome = await Effect.runPromise(
      Effect.flip(addToLetterboxdWatchlist(deps, movie({ trakt: 42 }))),
    );
    expect(outcome._tag).toBe('ProviderDecodeError');
  });

  test('rejects a non-movie item routing.ts should have filtered', async () => {
    const deps = fakeDeps({});
    const show = { ...movie({ letterboxd: 'the-thing' }), type: 'TV' as const };
    const outcome = await Effect.runPromise(
      Effect.flip(addToLetterboxdWatchlist(deps, show)),
    );
    expect(outcome._tag).toBe('ProviderDecodeError');
  });

  test('maps a 403 (expired session / CSRF) to a dead-session auth error', async () => {
    const deps = fakeDeps({ webResponse: { status: 403, body: '' } });
    const outcome = await Effect.runPromise(
      Effect.flip(addToLetterboxdWatchlist(deps, movie({ letterboxd: 'the-thing' }))),
    );
    expect(outcome._tag).toBe('ProviderAuthError');
  });

  test('maps the script-level no-csrf marker to a dead session', async () => {
    const deps = fakeDeps({ webResponse: { status: 0, body: 'no-csrf' } });
    const outcome = await Effect.runPromise(
      Effect.flip(addToLetterboxdWatchlist(deps, movie({ letterboxd: 'the-thing' }))),
    );
    expect(outcome._tag).toBe('ProviderAuthError');
  });

  test('maps a script fetch failure to a network error', async () => {
    const deps = fakeDeps({
      webResponse: { status: 0, body: 'fetch-error: TypeError' },
    });
    const outcome = await Effect.runPromise(
      Effect.flip(addToLetterboxdWatchlist(deps, movie({ letterboxd: 'the-thing' }))),
    );
    expect(outcome._tag).toBe('ProviderNetworkError');
  });

  test('maps a 429 to a rate-limit error', async () => {
    const deps = fakeDeps({ webResponse: { status: 429, body: '' } });
    const outcome = await Effect.runPromise(
      Effect.flip(addToLetterboxdWatchlist(deps, movie({ letterboxd: 'the-thing' }))),
    );
    expect(outcome._tag).toBe('ProviderRateLimitError');
  });

  test('maps an unexpected status to a decode error naming it', async () => {
    const deps = fakeDeps({ webResponse: { status: 500, body: 'oops' } });
    const outcome = await Effect.runPromise(
      Effect.flip(addToLetterboxdWatchlist(deps, movie({ letterboxd: 'the-thing' }))),
    );
    expect(outcome._tag).toBe('ProviderDecodeError');
    expect((outcome as { detail: string }).detail).toContain('500');
  });
});
