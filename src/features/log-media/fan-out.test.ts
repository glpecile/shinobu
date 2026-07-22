import { describe, expect, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';
import { fanOutLog, type LogMediaVariables } from './fan-out';

const item: NormalizedMediaItem = {
  id: 'trakt-1',
  title: 'Perfect Blue',
  coverImage: '',
  type: 'ANIME',
  isFilm: true,
  currentProgress: 0,
  progressUnit: 'episode',
  lastUpdated: '2026-07-10T00:00:00Z',
  externalIds: { trakt: 1, tmdb: 10494 },
};

const variables: LogMediaVariables = { item };

describe('fanOutLog', () => {
  test('all providers succeeding yields ok outcomes in target order', async () => {
    const result = await fanOutLog(
      {
        trakt: () => Promise.resolve({ status: 'ok' as const }),
        letterboxd: () => Promise.resolve({ status: 'ok' as const }),
      },
      ['trakt', 'letterboxd'],
      variables,
    );

    expect(result.outcomes).toEqual([
      { provider: 'trakt', status: 'ok' },
      { provider: 'letterboxd', status: 'ok' },
    ]);
    expect(result.succeeded).toEqual(['trakt', 'letterboxd']);
    expect(result.failed).toEqual([]);
  });

  test('one failure surfaces per-provider, never collapsing the others', async () => {
    const result = await fanOutLog(
      {
        trakt: () => Promise.resolve({ status: 'ok' as const }),
        letterboxd: () => Promise.reject(new Error('api access revoked')),
      },
      ['trakt', 'letterboxd'],
      variables,
    );

    expect(result.succeeded).toEqual(['trakt']);
    expect(result.failed).toEqual(['letterboxd']);
    expect(result.outcomes[1]).toEqual({
      provider: 'letterboxd',
      status: 'error',
      message: 'api access revoked',
    });
  });

  test('a routed target without an adapter is a loud error, not a skip', async () => {
    const result = await fanOutLog(
      { trakt: () => Promise.resolve({ status: 'ok' as const }) },
      ['trakt', 'anilist'],
      variables,
    );

    expect(result.failed).toEqual(['anilist']);
    expect(result.outcomes[1]).toEqual({
      provider: 'anilist',
      status: 'error',
      message: 'anilist write adapter is not implemented yet',
    });
  });

  test('adapters run in parallel and outcomes keep target order', async () => {
    const started: string[] = [];
    const result = await fanOutLog(
      {
        trakt: () => {
          started.push('trakt');
          // Slowest adapter first — its outcome must still come first.
          return new Promise((resolve) => setTimeout(() => resolve({ status: 'ok' as const }), 20));
        },
        letterboxd: () => {
          started.push('letterboxd');
          return Promise.resolve({ status: 'ok' as const });
        },
      },
      ['trakt', 'letterboxd'],
      variables,
    );

    // Both dispatched before the slow one settled ⇒ parallel, not sequential.
    expect(started).toEqual(['trakt', 'letterboxd']);
    expect(result.outcomes.map((outcome) => outcome.provider)).toEqual([
      'trakt',
      'letterboxd',
    ]);
  });

  test('an adapter-reported skip surfaces as a skipped outcome with its reason', async () => {
    const result = await fanOutLog(
      {
        trakt: () => Promise.resolve({ status: 'ok' as const }),
        serializd: () =>
          Promise.resolve({ status: 'skipped' as const, reason: 'season unavailable' }),
      },
      ['trakt', 'serializd'],
      variables,
    );

    // A skip is a success value: it never joins `failed`, and the other
    // provider's write still succeeds (plan 0017 R9 / AE4).
    expect(result.succeeded).toEqual(['trakt']);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual(['serializd']);
    expect(result.outcomes[1]).toEqual({
      provider: 'serializd',
      status: 'skipped',
      reason: 'season unavailable',
    });
  });

  test('Covers AE2 — a Serializd auth failure is per-provider; Trakt still succeeds, nothing retried', async () => {
    let serializdCalls = 0;
    const result = await fanOutLog(
      {
        trakt: () => Promise.resolve({ status: 'ok' as const }),
        serializd: () => {
          serializdCalls++;
          return Promise.reject(
            new Error('serializd: session expired or was rejected — reconnect serializd'),
          );
        },
      },
      ['trakt', 'serializd'],
      variables,
    );

    expect(result.succeeded).toEqual(['trakt']);
    expect(result.failed).toEqual(['serializd']);
    expect(result.outcomes[1]).toMatchObject({ provider: 'serializd', status: 'error' });
    expect((result.outcomes[1] as { message: string }).message).toContain('reconnect');
    // fanOutLog fires each adapter exactly once — the fan-out never retries.
    expect(serializdCalls).toBe(1);
  });

  test('non-Error rejections stringify into the outcome message', async () => {
    const result = await fanOutLog(
      { trakt: () => Promise.reject('boom') },
      ['trakt'],
      variables,
    );

    expect(result.outcomes[0]).toEqual({
      provider: 'trakt',
      status: 'error',
      message: 'boom',
    });
  });
});
