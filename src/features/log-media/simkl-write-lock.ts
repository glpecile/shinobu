import type { ProviderWriteResult } from '@/features/log-media/fan-out';
import { ProviderNetworkError, ProviderRateLimitError } from '@/lib/providers/errors';
import type { SimklLogEntry } from '@/lib/providers/simkl/writes';

/**
 * Simkl's ~20-second per-user write lock, plus a margin: a second `/sync/*`
 * POST inside it answers `400 rate_limit`
 * (docs/solutions/simkl-rate-limits-and-write-lock.md). Measured from the
 * previous POST *completing*, the conservative end.
 */
export const SIMKL_WRITE_LOCK_MS = 21_000;

interface Waiter {
  entry: SimklLogEntry;
  resolve: (result: ProviderWriteResult) => void;
  reject: (error: unknown) => void;
  attempts: number;
}

export interface SimklLogQueue {
  log: (entry: SimklLogEntry) => Promise<ProviderWriteResult>;
}

export interface QueueClock {
  now: () => number;
  schedule: (run: () => void, ms: number) => void;
}

const REAL_CLOCK: QueueClock = {
  now: () => Date.now(),
  schedule: (run, ms) => {
    setTimeout(run, ms);
  },
};

/** Simkl's own guidance: give up on a transient failure after 5 attempts. */
const MAX_ATTEMPTS = 5;

/**
 * What Simkl's docs say to retry: its write lock (`400 RATE_LIMIT`, "your
 * previous write is still running"), the per-second `429`, and `500`/`502`/
 * `503` (api.simkl.org/resources/rate-limits). Anything else may have landed
 * or never will, so it isn't replayed.
 */
function isTransient(error: unknown): boolean {
  // A Retry-After delay signals a quota limit, not the transient write lock.
  if (error instanceof ProviderRateLimitError) return error.retryAfterMs == null;
  return (
    error instanceof ProviderNetworkError &&
    (error.status === 500 || error.status === 502 || error.status === 503)
  );
}

function backoffMs(attempts: number): number {
  return 1_000 * 2 ** attempts;
}

/**
 * Coalesces concurrent Simkl history writes into a single batched POST after
 * the ~20s write lock clears, retrying only transient failures outside the
 * lock window (docs/solutions/anilist-rate-limit-retry-storm.md).
 */
export function createSimklLogQueue(
  send: (entries: SimklLogEntry[]) => Promise<ProviderWriteResult>,
  clock: QueueClock = REAL_CLOCK,
): SimklLogQueue {
  let lockedUntil = 0;
  let inFlight = false;
  let flushScheduled = false;
  let pending: Waiter[] = [];

  function scheduleFlush() {
    if (flushScheduled || inFlight || pending.length === 0) return;
    flushScheduled = true;
    clock.schedule(flush, Math.max(0, lockedUntil - clock.now()));
  }

  function flush() {
    flushScheduled = false;
    if (inFlight || pending.length === 0) return;
    if (clock.now() < lockedUntil) {
      scheduleFlush();
      return;
    }
    const batch = pending;
    pending = [];
    void fire(batch);
  }

  async function fire(batch: Waiter[]) {
    inFlight = true;
    let wait = SIMKL_WRITE_LOCK_MS;
    try {
      const result = await send(batch.map((waiter) => waiter.entry));
      for (const waiter of batch) waiter.resolve(result);
    } catch (error) {
      for (const waiter of batch) waiter.attempts += 1;
      const retry = isTransient(error)
        ? batch.filter((waiter) => waiter.attempts < MAX_ATTEMPTS)
        : [];
      for (const waiter of batch) {
        if (!retry.includes(waiter)) waiter.reject(error);
      }
      pending = [...retry, ...pending];
      if (retry.length > 0) {
        wait = backoffMs(Math.max(...retry.map((waiter) => waiter.attempts)));
      }
    } finally {
      inFlight = false;
      lockedUntil = clock.now() + wait;
      scheduleFlush();
    }
  }

  return {
    log(entry) {
      return new Promise<ProviderWriteResult>((resolve, reject) => {
        const waiter: Waiter = { entry, resolve, reject, attempts: 0 };
        if (!inFlight && clock.now() >= lockedUntil && pending.length === 0) {
          void fire([waiter]);
          return;
        }
        pending.push(waiter);
        scheduleFlush();
      });
    },
  };
}
