import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';

// Import-time stub: MMKV doesn't load under bun. API-identical to the other
// suites' stubs, because `mock.module` is process-wide
// (docs/solutions/bun-mock-module-leaks-across-suites.md).
const store = new Map<string, string>();
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => store.get(key),
    set: (key: string, value: string) => store.set(key, value),
    remove: (key: string) => store.delete(key),
    getAllKeys: () => [...store.keys()],
    addOnValueChangedListener: () => ({ remove() {} }),
  }),
}));

// The store never touches storage during a server render, which is what bun looks like.
(globalThis as { window?: unknown }).window ??= globalThis;

const {
  checkLegs,
  discardPendingLog,
  pendingLogs,
  queuePendingLog,
  settleLeg,
} = await import('./pending-logs');
type PendingLog = import('./pending-logs').PendingLog;

const item: NormalizedMediaItem = {
  id: 'trakt-1', title: 'Frieren', coverImage: '', type: 'TV',
  currentProgress: 0, progressUnit: 'episode', lastUpdated: '', externalIds: { trakt: 1 },
};
const episode5 = { item, episodes: [{ season: 1, number: 5 }] };
const NOW = Date.UTC(2026, 10, 24);
const DAY = 24 * 60 * 60_000;

beforeEach(() => {
  for (const record of pendingLogs()) discardPendingLog(record.id);
});

describe('queuePendingLog', () => {
  test('pins the watch time, so a replay days later keeps the day it was watched', () => {
    queuePendingLog(episode5, ['trakt'], 'unsent', NOW);

    expect(pendingLogs()[0]?.variables.watchedAt).toBe(new Date(NOW).toISOString());
  });

  test('the same watch queued twice is one record, and a leg that may have landed stays uncertain', () => {
    queuePendingLog(episode5, ['trakt', 'simkl'], 'uncertain', NOW);
    queuePendingLog(episode5, ['trakt'], 'unsent', NOW + 1);

    expect(pendingLogs().map((record) => Object.entries(record.legs).map(([id, leg]) => [id, leg.state]))).toEqual([
      [['simkl', 'uncertain']],
      [['trakt', 'uncertain']],
    ]);
  });
});

describe('checkLegs', () => {
  const record: PendingLog = {
    id: 'r1',
    queuedAt: NOW,
    variables: { ...episode5, watchedAt: new Date(NOW).toISOString() },
    legs: { trakt: { state: 'unsent', epoch: 7 }, simkl: { state: 'uncertain', epoch: 7 } },
  };
  const states = (checked: PendingLog) => Object.values(checked.legs).map((leg) => leg.state);

  test('a leg under the session it was saved with is still sent', () => {
    expect(states(checkLegs(record, NOW + DAY, () => 7, ['trakt', 'simkl']))).toEqual(['unsent', 'uncertain']);
  });

  test('a provider connected again since is never sent the old account’s log', () => {
    const checked = checkLegs(record, NOW + DAY, (id) => (id === 'trakt' ? 8 : 7), ['trakt', 'simkl']);

    expect(states(checked)).toEqual(['failed', 'uncertain']);
  });

  test('a provider that cannot be used stops, and remembers that its write may have landed', () => {
    expect(checkLegs(record, NOW + DAY, () => 7, ['trakt']).legs.simkl).toMatchObject({ state: 'failed', sent: true });
  });

  test('a record older than 7 days is no longer sent', () => {
    expect(states(checkLegs(record, NOW + 8 * DAY, () => 7, ['trakt', 'simkl']))).toEqual(['failed', 'failed']);
  });
});

describe('settleLeg', () => {
  const unsent = { state: 'unsent', epoch: 7 } as const;

  test('a logged or already-recorded leg leaves the queue', () => {
    expect(settleLeg('trakt', unsent, { provider: 'trakt', status: 'ok' })).toBeUndefined();
    expect(settleLeg('trakt', unsent, { provider: 'trakt', status: 'skipped' })).toBeUndefined();
  });

  test('a refused write waits as it was', () => {
    expect(
      settleLeg('simkl', unsent, { provider: 'simkl', status: 'error', message: 'slow down', transient: 'rate-limit' }),
    ).toEqual(unsent);
  });

  test('an unanswered write is sent again only where a read can prove it did not land', () => {
    const lost = { status: 'error', message: 'timeout', transient: 'network' } as const;

    expect(settleLeg('trakt', unsent, { provider: 'trakt', ...lost })).toEqual({ state: 'uncertain', epoch: 7 });
    expect(settleLeg('simkl', unsent, { provider: 'simkl', ...lost })).toEqual({
      state: 'failed', message: 'timeout', sent: true,
    });
  });

  test('an answered error, a reasoned skip and an unrouted provider stop with their reason', () => {
    expect(settleLeg('trakt', unsent, { provider: 'trakt', status: 'error', message: 'session expired' }))
      .toEqual({ state: 'failed', message: 'session expired', sent: false });
    expect(settleLeg('anilist', unsent, { provider: 'anilist', status: 'skipped', reason: 'no entry' }))
      .toEqual({ state: 'failed', message: 'no entry', sent: false });
    expect(settleLeg('anilist', unsent, undefined)).toMatchObject({ state: 'failed', sent: false });
  });
});
