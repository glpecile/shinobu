import { describe, expect, it } from 'bun:test';
import { Effect, Either } from 'effect';

import type { ProviderId } from './types';
import { ProviderRateLimitError, type ProviderError } from './errors';

/**
 * Executable documentation of the fan-out boundary pattern (see
 * docs/brainstorms/2026-07-07-effect-for-provider-layer.md): parallel
 * per-provider writes collected with `mode: 'either'`, so one provider's
 * failure never swallows another's success — the exact partial-failure
 * contract AGENTS.md requires of `useLogMedia`.
 */
const fakeWrite = (
  provider: ProviderId,
  fail: boolean,
): Effect.Effect<ProviderId, ProviderError> =>
  fail
    ? Effect.fail(new ProviderRateLimitError({ provider, retryAfterMs: 1000 }))
    : Effect.succeed(provider);

describe('provider error boundary pattern', () => {
  it('surfaces partial failure per provider, not as one collapsed throw', async () => {
    const results = await Effect.runPromise(
      Effect.all([fakeWrite('trakt', false), fakeWrite('letterboxd', true)], {
        concurrency: 'unbounded',
        mode: 'either',
      }),
    );

    expect(Either.isRight(results[0])).toBe(true);
    expect(Either.isLeft(results[1])).toBe(true);

    if (Either.isLeft(results[1])) {
      expect(results[1].left._tag).toBe('ProviderRateLimitError');
      expect(results[1].left.provider).toBe('letterboxd');
    }
  });

  it('discriminates error kinds by tag for targeted recovery', async () => {
    const recovered = await Effect.runPromise(
      fakeWrite('anilist', true).pipe(
        Effect.catchTag('ProviderRateLimitError', (e) =>
          Effect.succeed(`retry ${e.provider} in ${e.retryAfterMs}ms` as const),
        ),
      ),
    );

    expect(recovered).toBe('retry anilist in 1000ms');
  });
});
