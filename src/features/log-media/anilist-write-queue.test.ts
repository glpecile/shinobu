import { describe, expect, test } from 'bun:test';

import { createAniListWriteQueue } from './anilist-write-queue';

/** A promise plus the handles to settle it by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Hand-driven settle window — the tests never wait out the real one. */
function testClock() {
  const timers: Array<() => void> = [];
  let time = 0;
  return {
    clock: { schedule: (run: () => void) => void timers.push(run), now: () => time },
    /** Fires only the oldest pending timer. */
    fireOldest: async () => {
      await tick();
      timers.shift()?.();
      await tick();
    },
    setNow: (ms: number) => {
      time = ms;
    },
    /**
     * "The window elapsed" — repeatedly, because each write that goes out
     * schedules the next window when it lands.
     */
    advance: async (rounds = 6) => {
      for (let i = 0; i < rounds; i += 1) {
        await tick();
        while (timers.length > 0) timers.shift()!();
      }
      await tick();
    },
  };
}

describe('createAniListWriteQueue', () => {

  test('writes waiting on one entry collapse into its highest episode', async () => {
    const { clock, advance } = testClock();
    const queue = createAniListWriteQueue(clock);
    const first = deferred<string>();
    const ranks: number[] = [];
    const run = (rank: number) => () => {
      ranks.push(rank);
      return rank === 3 ? first.promise : Promise.resolve(`wrote ${rank}`);
    };

    const head = queue.submit('1:false', 3, run(3));
    // Episodes 4–6 arrive while episode 3 is still in the air.
    const folded = [4, 5, 6].map((rank) => queue.submit('1:false', rank, run(rank)));
    await tick();
    expect(ranks).toEqual([3]);

    first.resolve('wrote 3');
    expect(await head).toBe('wrote 3');
    await advance();
    // One write for all three, carrying the highest progress — and every
    // folded caller resolves with it, because the entry really is at 6.
    expect(await Promise.all(folded)).toEqual(['wrote 6', 'wrote 6', 'wrote 6']);
    expect(ranks).toEqual([3, 6]);
  });

  test('a different entry is its own write, never folded in', async () => {
    const { clock, advance } = testClock();
    const queue = createAniListWriteQueue(clock);
    const first = deferred<string>();
    const ranks: string[] = [];
    const run = (label: string, promise?: Promise<string>) => () => {
      ranks.push(label);
      return promise ?? Promise.resolve(label);
    };

    const head = queue.submit('1:false', 1, run('a1', first.promise));
    const other = queue.submit('2:false', 1, run('b1'));
    const rewatch = queue.submit('1:true', 2, run('a-rewatch'));
    first.resolve('a1');
    await advance();

    expect(await Promise.all([head, other, rewatch])).toEqual([
      'a1',
      'b1',
      'a-rewatch',
    ]);
    expect(ranks.sort()).toEqual(['a-rewatch', 'a1', 'b1']);
  });

  test('a null key never folds — a film rewatch is a fact per press', async () => {
    const { clock, advance } = testClock();
    const queue = createAniListWriteQueue(clock);
    const first = deferred<string>();
    let ran = 0;
    const run = (promise?: Promise<string>) => () => {
      ran += 1;
      return promise ?? Promise.resolve('film');
    };

    const head = queue.submit(null, 0, run(first.promise));
    const second = queue.submit(null, 0, run());
    const third = queue.submit(null, 0, run());
    first.resolve('film');
    await advance();

    await Promise.all([head, second, third]);
    expect(ran).toBe(3);
  });

  test('the folded batch shares the write it was folded into, failure included', async () => {
    const { clock, advance } = testClock();
    const queue = createAniListWriteQueue(clock);
    const first = deferred<string>();
    const head = queue.submit('1:false', 3, () => first.promise);
    const folded = queue.submit('1:false', 4, () =>
      Promise.reject(new Error('rate limited')),
    );
    const settled = folded.then(
      () => 'resolved',
      (error: Error) => error.message,
    );
    first.resolve('wrote 3');
    await head;
    await advance();
    expect(await settled).toBe('rate limited');
  });

  test('a rejection does not wedge the queue', async () => {
    const { clock, advance } = testClock();
    const queue = createAniListWriteQueue(clock);
    await queue.submit('1:false', 1, () => Promise.reject(new Error('nope'))).catch(() => {});
    await advance();
    expect(await queue.submit('1:false', 2, () => Promise.resolve('after'))).toBe(
      'after',
    );
  });

  test('each press restarts the settle window until the hold cap', async () => {
    const { clock, advance, fireOldest, setNow } = testClock();
    const queue = createAniListWriteQueue(clock);
    const ranks: number[] = [];
    const run = (rank: number) => () => {
      ranks.push(rank);
      return Promise.resolve(`wrote ${rank}`);
    };

    // Episode 3 lands before episode 4 is pressed, so only the window can
    // fold 4 and 5 — and 5 arriving restarts it, outdating 3's timer.
    await queue.submit('1:false', 3, run(3));
    const four = queue.submit('1:false', 4, run(4));
    await fireOldest();
    expect(ranks).toEqual([3]);
    const five = queue.submit('1:false', 5, run(5));
    await advance();
    expect(await Promise.all([four, five])).toEqual(['wrote 5', 'wrote 5']);
    expect(ranks).toEqual([3, 5]);

    // Past the cap an arrival no longer restarts it: 6's window drains 7.
    await queue.submit('1:false', 6, run(6));
    setNow(30_000);
    const seven = queue.submit('1:false', 7, run(7));
    await fireOldest();
    expect(await seven).toBe('wrote 7');
  });
});
