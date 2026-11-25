/**
 * AniList's rate limit is 30 req/min (docs/solutions/web-cors-anilist.md),
 * each log costs two requests (`getEntryState` + `SaveMediaListEntry`), and
 * progress is a single overwritten counter per entry. Coalesce queued writes
 * per entry instead of retrying on 429 (docs/solutions/anilist-rate-limit-retry-storm.md).
 */

const FOLD_WINDOW_MS = 5_000;

const MAX_HOLD_MS = 30_000;

export interface FoldClock {
  schedule: (run: () => void, ms: number) => void;
  now: () => number;
}

const REAL_CLOCK: FoldClock = {
  schedule: (run, ms) => {
    setTimeout(run, ms);
  },
  now: () => Date.now(),
};

interface Waiter<T> {
  key: string | null;
  rank: number;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

export interface AniListWriteQueue {
  /**
   * Serializes AniList writes. Waiting calls with the same non-null `key`
   * collapse into the highest `rank` (all callers share its outcome); `null`
   * never folds (e.g. film rewatches, where `repeat` increments).
   */
  submit: <T>(key: string | null, rank: number, run: () => Promise<T>) => Promise<T>;
}

export function createAniListWriteQueue(
  clock: FoldClock = REAL_CLOCK,
): AniListWriteQueue {
  let inFlight = false;
  let settling = false;
  let holdStartedAt = 0;
  let window = 0;
  const pending: Waiter<unknown>[] = [];

  function drain(): void {
    if (inFlight || settling || pending.length === 0) return;
    const head = pending.shift()!;
    const batch = [head];
    if (head.key != null) {
      for (let i = pending.length - 1; i >= 0; i -= 1) {
        if (pending[i]!.key === head.key) batch.unshift(...pending.splice(i, 1));
      }
    }
    const winner = batch.reduce((best, waiter) =>
      waiter.rank > best.rank ? waiter : best,
    );

    inFlight = true;
    void winner.run().then(
      (value) => {
        for (const waiter of batch) waiter.resolve(value);
        settle();
      },
      (error: unknown) => {
        for (const waiter of batch) waiter.reject(error);
        settle();
      },
    );
  }

  function settle(): void {
    inFlight = false;
    settling = true;
    holdStartedAt = clock.now();
    restartWindow();
  }

  function restartWindow(): void {
    const current = ++window;
    clock.schedule(() => {
      if (current !== window) return;
      settling = false;
      drain();
    }, FOLD_WINDOW_MS);
  }

  return {
    submit(key, rank, run) {
      return new Promise((resolve, reject) => {
        pending.push({ key, rank, run, resolve, reject } as unknown as Waiter<unknown>);
        if (settling && clock.now() - holdStartedAt < MAX_HOLD_MS) restartWindow();
        drain();
      });
    },
  };
}
