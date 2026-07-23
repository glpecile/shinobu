import { describe, expect, test } from 'bun:test';

import type { LogMediaResult } from '@/features/log-media/fan-out';
import type { ProviderId } from '@/lib/providers/types';

import {
  isQuickLogPending,
  resolveQuickLog,
  settleTransition,
} from './quick-log-state';

function result(overrides: Partial<LogMediaResult> = {}): LogMediaResult {
  return {
    outcomes: [],
    succeeded: [],
    failed: [],
    skipped: [],
    rewatch: false,
    ...overrides,
  };
}

const SOURCE: ProviderId = 'trakt';

describe('resolveQuickLog', () => {
  test('every provider succeeding settles quietly', () => {
    expect(
      resolveQuickLog(result({ succeeded: ['trakt', 'serializd'] }), SOURCE),
    ).toEqual({ phase: 'settling', notice: null });
  });

  test('source ok + another provider failing still settles, and names the failure', () => {
    expect(
      resolveQuickLog(
        result({ succeeded: ['trakt'], failed: ['serializd'] }),
        SOURCE,
      ),
    ).toEqual({ phase: 'settling', notice: 'Failed on Serializd.' });
  });

  test('source failing does not advance, even when another provider succeeded', () => {
    // The entry was computed from Trakt's data and only succeeded providers'
    // keys are refetched — there is no new data to advance from.
    expect(
      resolveQuickLog(
        result({ succeeded: ['serializd'], failed: ['trakt'] }),
        SOURCE,
      ),
    ).toEqual({ phase: 'failed', notice: 'Failed on Trakt.' });
  });

  test('every applicable provider failing reverts and names them all', () => {
    expect(
      resolveQuickLog(result({ failed: ['trakt', 'serializd'] }), SOURCE),
    ).toEqual({ phase: 'failed', notice: 'Failed on Trakt, Serializd.' });
  });

  test('a skipped source counts as ok — that provider already had the watch', () => {
    expect(
      resolveQuickLog(result({ skipped: ['trakt'], succeeded: [] }), SOURCE),
    ).toEqual({ phase: 'settling', notice: null });
  });

  test('a source that reported nothing at all is blamed rather than advanced', () => {
    expect(resolveQuickLog(result(), SOURCE)).toEqual({
      phase: 'failed',
      notice: 'Failed on Trakt.',
    });
  });
});

describe('isQuickLogPending', () => {
  test('pending spans the write and the settle, nothing else', () => {
    expect(isQuickLogPending('logging')).toBe(true);
    expect(isQuickLogPending('settling')).toBe(true);
    expect(isQuickLogPending('idle')).toBe(false);
    expect(isQuickLogPending('failed')).toBe(false);
    expect(isQuickLogPending('settle-failed')).toBe(false);
  });
});

describe('settleTransition', () => {
  test('holds while the slot is refetching', () => {
    expect(
      settleTransition({
        phase: 'settling',
        fetching: true,
        sawFetch: true,
        timedOut: false,
      }),
    ).toBeNull();
  });

  test('holds before the refetch has started (invalidation is async)', () => {
    expect(
      settleTransition({
        phase: 'settling',
        fetching: false,
        sawFetch: false,
        timedOut: false,
      }),
    ).toBeNull();
  });

  test('a completed refetch that left the card in place ends the pending state', () => {
    expect(
      settleTransition({
        phase: 'settling',
        fetching: false,
        sawFetch: true,
        timedOut: false,
      }),
    ).toBe('idle');
  });

  test('a settle that never lands times out into a retry notice, not a spinner', () => {
    expect(
      settleTransition({
        phase: 'settling',
        fetching: true,
        sawFetch: true,
        timedOut: true,
      }),
    ).toBe('settle-failed');
  });

  test('phases other than settling are left alone', () => {
    expect(
      settleTransition({
        phase: 'failed',
        fetching: false,
        sawFetch: true,
        timedOut: true,
      }),
    ).toBeNull();
  });
});
