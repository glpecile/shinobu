import { describe, expect, test } from 'bun:test';

import { none, settle } from './settle';

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

describe('none', () => {
  test('a disconnected provider contributes nothing, and that is not an error', () => {
    expect(none<number>()).toEqual({ inputs: [], errors: [] });
  });
});
