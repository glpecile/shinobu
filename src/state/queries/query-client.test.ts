import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import {
  ProviderAuthError,
  ProviderDecodeError,
  ProviderNetworkError,
  ProviderRateLimitError,
} from '@/lib/providers/errors';

import { isRetryable, retryCountFor, retryDelay } from './query-client';

/**
 * The retry predicate keys off the FiberFailure label Effect produces when a
 * tagged error is thrown out of `Effect.runPromise` — so exercise it through a
 * real `runPromise`, not hand-built strings, to stay honest about the shape.
 */
async function reject(effect: Effect.Effect<never, unknown>): Promise<unknown> {
  try {
    await Effect.runPromise(effect);
    throw new Error('expected rejection');
  } catch (error) {
    return error;
  }
}

describe('retry classification', () => {
  test('rate-limit and auth failures are never retried', async () => {
    const rl = await reject(
      Effect.fail(new ProviderRateLimitError({ provider: 'trakt' })),
    );
    const auth = await reject(
      Effect.fail(
        new ProviderAuthError({ provider: 'trakt', refreshFailed: true }),
      ),
    );
    expect(isRetryable(rl)).toBe(false);
    expect(retryCountFor(rl)).toBe(0);
    expect(isRetryable(auth)).toBe(false);
    expect(retryCountFor(auth)).toBe(0);
  });

  test('transient network errors get an extra retry over other failures', async () => {
    const net = await reject(
      Effect.fail(
        new ProviderNetworkError({
          provider: 'trakt',
          cause: new TypeError('NetworkError when attempting to fetch resource'),
        }),
      ),
    );
    const decode = await reject(
      Effect.fail(
        new ProviderDecodeError({ provider: 'trakt', detail: 'non-JSON body' }),
      ),
    );
    expect(isRetryable(net)).toBe(true);
    expect(retryCountFor(net)).toBe(3);
    expect(isRetryable(decode)).toBe(true);
    expect(retryCountFor(decode)).toBe(2);
  });
});

describe('retryDelay jitter', () => {
  test('stays within [floor, backoff] and is not a fixed value', () => {
    const samples = Array.from({ length: 200 }, () => retryDelay(0));
    for (const ms of samples) {
      expect(ms).toBeGreaterThanOrEqual(500); // backoff/2 floor at attempt 0
      expect(ms).toBeLessThanOrEqual(1_000); // full backoff at attempt 0
    }
    // Equal jitter must actually spread — not collapse to one delay.
    expect(new Set(samples.map((ms) => Math.round(ms))).size).toBeGreaterThan(10);
  });

  test('backoff grows with attempt and caps', () => {
    // Floors: attempt 0 → 500, attempt 1 → 1000, attempt 3 → 4000; capped.
    expect(retryDelay(1)).toBeGreaterThanOrEqual(1_000);
    expect(retryDelay(3)).toBeGreaterThanOrEqual(4_000);
    expect(retryDelay(20)).toBeLessThanOrEqual(30_000);
  });
});
