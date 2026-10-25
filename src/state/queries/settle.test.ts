import { describe, expect, test } from 'bun:test';

import { settle, streamLegs } from './settle';

/**
 * The shared partial-failure contract, tested once now that two gatherers
 * depend on it (plan 0031 R26 — lifted from `up-next.ts`, not copied).
 */
describe('settle', () => {
  test('passes a leg’s rows through with no errors', async () => {
    expect(await settle('trakt', async () => [1, 2])).toEqual({
      inputs: [1, 2],
      errors: [],
    });
  });

  test('captures a rejection as this provider’s error instead of throwing', async () => {
    expect(
      await settle('anilist', () => Promise.reject(new Error('anilist down'))),
    ).toEqual({ inputs: [], errors: [{ provider: 'anilist', message: 'anilist down' }] });
  });

  test('stringifies a non-Error rejection rather than losing it', async () => {
    const settled = await settle('letterboxd', () => Promise.reject('nope'));
    expect(settled.errors[0].message).toBe('nope');
  });
});

describe('streamLegs', () => {
  test('yields each partial worth showing as legs settle, then the whole', async () => {
    const { promise: slow, resolve: releaseSlow } = Promise.withResolvers<number[]>();
    const stream = streamLegs(
      [[] as number[], Promise.resolve([1]), slow],
      (legs) => legs.flatMap((leg) => leg ?? []),
      (partial) => partial.length > 0,
    );

    // The empty leg settles first and is skipped; the fast one shows alone.
    expect((await stream.next()).value).toEqual([1]);
    releaseSlow([2]);
    expect((await stream.next()).value).toEqual([1, 2]);
    expect((await stream.next()).done).toBe(true);
  });
});
