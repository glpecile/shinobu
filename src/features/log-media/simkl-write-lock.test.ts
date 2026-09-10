import { describe, expect, mock, test } from 'bun:test';

import type { SimklLogEntry } from '@/lib/providers/simkl/writes';
import type { NormalizedMediaItem } from '@/types/media';

import {
  SIMKL_WRITE_LOCK_MS,
  createSimklLogQueue,
  type QueueClock,
} from './simkl-write-lock';

const item: NormalizedMediaItem = {
  id: 'simkl-1',
  title: 'Show',
  coverImage: '',
  type: 'TV',
  currentProgress: 0,
  progressUnit: 'episode',
  lastUpdated: '2026-09-01T00:00:00.000Z',
  externalIds: { simkl: 1 },
};

const entry = (number: number): SimklLogEntry => ({
  item,
  episode: { season: 1, number },
});

/** Hand-driven clock: `advance` fires due timers in order. */
function fakeClock() {
  let now = 0;
  const timers: Array<{ at: number; run: () => void }> = [];
  const clock: QueueClock = {
    now: () => now,
    schedule: (run, ms) => {
      timers.push({ at: now + ms, run });
    },
  };
  async function advance(ms: number) {
    const target = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (next == null || next.at > target) break;
      timers.shift();
      now = next.at;
      next.run();
      // Let promise continuations settle between timers.
      await Promise.resolve();
      await Promise.resolve();
    }
    now = target;
  }
  return { clock, advance, timers };
}

const ok = { status: 'ok' as const };

/** Microtask drain, so `fire`'s await/finally run before assertions. */
const settle = async () => {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
};

describe('createSimklLogQueue', () => {
  test('an unlocked queue posts immediately, alone', async () => {
    const send = mock(async (_entries: SimklLogEntry[]) => ok);
    const { clock } = fakeClock();
    const queue = createSimklLogQueue(send, clock);
    await expect(queue.log(entry(1))).resolves.toEqual(ok);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual([entry(1)]);
  });

  test('writes inside the lock coalesce into one POST when it lifts', async () => {
    const send = mock(async (_entries: SimklLogEntry[]) => ok);
    const { clock, advance } = fakeClock();
    const queue = createSimklLogQueue(send, clock);

    const first = queue.log(entry(1));
    await settle();
    // Three more confirms while the lock is engaged.
    const second = queue.log(entry(2));
    const third = queue.log(entry(3));
    await advance(5_000);
    const fourth = queue.log(entry(4));
    expect(send).toHaveBeenCalledTimes(1);

    await advance(SIMKL_WRITE_LOCK_MS);
    await settle();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toEqual([entry(2), entry(3), entry(4)]);
    await expect(Promise.all([first, second, third, fourth])).resolves.toEqual([ok, ok, ok, ok]);
  });

  test('a write that arrives during an in-flight POST waits for the lock after it', async () => {
    let release: (() => void) | undefined;
    const send = mock(
      (_entries: SimklLogEntry[]) =>
        new Promise<typeof ok>((resolve) => {
          release = () => resolve(ok);
        }),
    );
    const { clock, advance } = fakeClock();
    const queue = createSimklLogQueue(send, clock);

    const first = queue.log(entry(1));
    const second = queue.log(entry(2));
    expect(send).toHaveBeenCalledTimes(1);
    release?.();
    await settle();
    await expect(first).resolves.toEqual(ok);
    // The lock starts when the first POST *completes*, not when it started.
    await advance(SIMKL_WRITE_LOCK_MS - 1);
    expect(send).toHaveBeenCalledTimes(1);
    await advance(1);
    await settle();
    expect(send).toHaveBeenCalledTimes(2);
    release?.();
    await expect(second).resolves.toEqual(ok);
  });

  test('a batch bounced by the lock is re-queued once, then fails', async () => {
    const bounce = Object.assign(new Error('simkl: rate limited'), {
      name: 'ProviderRateLimitError',
    });
    let calls = 0;
    const send = mock(async () => {
      calls += 1;
      throw bounce;
    });
    const { clock, advance } = fakeClock();
    const queue = createSimklLogQueue(send, clock);

    const result = queue.log(entry(1));
    // Attach the rejection handler now, before any timer can settle it.
    const outcome = result.then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await settle();
    expect(calls).toBe(1);
    await advance(SIMKL_WRITE_LOCK_MS);
    await settle();
    expect(calls).toBe(2);
    await expect(outcome).resolves.toBe(bounce);
  });

  test('a non-lock error rejects only that POST’s waiters', async () => {
    const boom = new Error('ProviderNetworkError: offline');
    const send = mock(async (entries: SimklLogEntry[]) => {
      if (entries[0]?.episode?.number === 1) throw boom;
      return ok;
    });
    const { clock, advance } = fakeClock();
    const queue = createSimklLogQueue(send, clock);

    const first = queue.log(entry(1)).then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await settle();
    const second = queue.log(entry(2));
    await expect(first).resolves.toBe(boom);
    await advance(SIMKL_WRITE_LOCK_MS);
    await settle();
    await expect(second).resolves.toEqual(ok);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
