import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { SimklDeps } from './deps';
import { simklHttp } from './http';

interface RecordedCall {
  url: URL;
  init?: RequestInit;
}

function makeDeps(handler: (url: string, init?: RequestInit) => Response): {
  deps: SimklDeps;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const deps: SimklDeps = {
    clientId: 'cid-1',
    fetch: async (input, init) => {
      calls.push({ url: new URL(String(input)), init });
      return handler(String(input), init);
    },
    tokens: {
      get: () => null,
      set: () => {},
      clear: () => {},
    },
  };
  return { deps, calls };
}

describe('simklHttp', () => {
  test('attaches the standard params to every API request', async () => {
    const { deps, calls } = makeDeps(() => Response.json({ ok: true }));
    await Effect.runPromise(simklHttp(deps, '/sync/activities'));
    const url = calls[0]!.url;
    expect(url.origin).toBe('https://api.simkl.com');
    expect(url.pathname).toBe('/sync/activities');
    expect(url.searchParams.get('client_id')).toBe('cid-1');
    expect(url.searchParams.get('app-name')).toBe('shinobu');
    expect(url.searchParams.get('app-version')).not.toBeNull();
  });

  test('401 maps to ProviderAuthError as a dead session, with no retry', async () => {
    const { deps, calls } = makeDeps(
      () => new Response(null, { status: 401 }),
    );
    const error = await Effect.runPromise(
      Effect.flip(simklHttp(deps, '/sync/all-items', { accessToken: 'tok-x' })),
    );
    expect(error._tag).toBe('ProviderAuthError');
    if (error._tag === 'ProviderAuthError') {
      // No refresh grant exists (plan 0034 KTD-2): a 401 is terminal.
      expect(error.refreshFailed).toBe(true);
    }
    expect(calls).toHaveLength(1);
  });

  test('429 maps to ProviderRateLimitError, carrying Retry-After when sent', async () => {
    const { deps } = makeDeps(
      () => new Response(null, { status: 429, headers: { 'Retry-After': '3' } }),
    );
    const error = await Effect.runPromise(Effect.flip(simklHttp(deps, '/sync/history')));
    expect(error._tag).toBe('ProviderRateLimitError');
    if (error._tag === 'ProviderRateLimitError') {
      expect(error.retryAfterMs).toBe(3000);
    }
  });

  test('400 with a rate_limit body maps to ProviderRateLimitError (write lock)', async () => {
    const { deps } = makeDeps(
      () => Response.json({ error: 'rate_limit' }, { status: 400 }),
    );
    const error = await Effect.runPromise(Effect.flip(simklHttp(deps, '/sync/history')));
    expect(error._tag).toBe('ProviderRateLimitError');
  });

  test('other 400s map to ProviderNetworkError with the status', async () => {
    const { deps } = makeDeps(
      () => Response.json({ error: 'bad_request' }, { status: 400 }),
    );
    const error = await Effect.runPromise(Effect.flip(simklHttp(deps, '/sync/history')));
    expect(error._tag).toBe('ProviderNetworkError');
    if (error._tag === 'ProviderNetworkError') {
      expect(error.status).toBe(400);
    }
  });

  test('other non-2xx map to ProviderNetworkError with the status', async () => {
    const { deps } = makeDeps(() => new Response(null, { status: 503 }));
    const error = await Effect.runPromise(Effect.flip(simklHttp(deps, '/search/tv')));
    expect(error._tag).toBe('ProviderNetworkError');
    if (error._tag === 'ProviderNetworkError') {
      expect(error.status).toBe(503);
    }
  });

  test('a network failure maps to ProviderNetworkError', async () => {
    const { deps } = makeDeps(() => {
      throw new Error('offline');
    });
    const error = await Effect.runPromise(Effect.flip(simklHttp(deps, '/search/tv')));
    expect(error._tag).toBe('ProviderNetworkError');
  });

  test('an unparseable body maps to ProviderDecodeError', async () => {
    const { deps } = makeDeps(() => new Response('<html>nope</html>', { status: 200 }));
    const error = await Effect.runPromise(Effect.flip(simklHttp(deps, '/search/tv')));
    expect(error._tag).toBe('ProviderDecodeError');
  });

  test('serializes a JSON body on POST', async () => {
    const { deps, calls } = makeDeps(() => Response.json({ ok: true }));
    await Effect.runPromise(
      simklHttp(deps, '/sync/history', {
        method: 'POST',
        body: { movies: [] },
        accessToken: 'tok-1',
      }),
    );
    expect(calls[0]!.init?.method).toBe('POST');
    expect(calls[0]!.init?.body).toBe(JSON.stringify({ movies: [] }));
    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });
});
