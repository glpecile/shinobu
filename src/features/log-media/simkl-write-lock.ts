import type { ProviderWriteResult } from '@/features/log-media/fan-out';
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
  /** A batch bounced by the lock is re-queued exactly once. */
  retried: boolean;
}

export interface SimklLogQueue {
  log: (entry: SimklLogEntry) => Promise<ProviderWriteResult>;
}

/** Test seam: real timers in the app, hand-driven ones in `bun test`. */
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

function isRateLimit(error: unknown): boolean {
  // Effect surfaces the tagged error as a FiberFailure whose name/message
  // carries the tag — the same test `state/queries/query-client.ts` runs.
  const label =
    error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /ProviderRateLimitError/.test(label);
}

/**
 * Every Simkl history write in the app goes through one of these: writes that
 * arrive while the lock is engaged (or a POST is in flight) are **coalesced
 * into the next POST** rather than fired into the lock, because every Simkl
 * write endpoint takes arrays — "batch, never loop" applied across time. The
 * quick-log catch-up chain (plan 0037) is what made this necessary: five
 * confirms in ten seconds are five history writes, and without this the
 * second through fifth all failed on Simkl alone.
 *
 * Contract:
 * - No lock, nothing in flight → the entry POSTs immediately, alone.
 * - Otherwise it waits; when the lock lifts, everything waiting goes as ONE
 *   POST and every waiter resolves with that POST's result.
 * - A POST that still bounces off the lock (`ProviderRateLimitError`) is
 *   re-queued once behind a fresh window; a second bounce rejects its waiters,
 *   which the fan-out reports as a Simkl failure with the manual link.
 * - Any other error rejects the waiters of that POST only.
 *
 * Module state is per app lifetime — the lock is Simkl's, and it outlives no
 * process. Nothing here retries inside the window (the AniList lesson,
 * docs/solutions/anilist-rate-limit-retry-storm.md).
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
    try {
      const result = await send(batch.map((waiter) => waiter.entry));
      for (const waiter of batch) waiter.resolve(result);
    } catch (error) {
      const bounced = isRateLimit(error);
      const retry = bounced ? batch.filter((waiter) => !waiter.retried) : [];
      for (const waiter of batch) {
        if (retry.includes(waiter)) waiter.retried = true;
        else waiter.reject(error);
      }
      // Re-queued waiters go to the front so a bounced batch lands before
      // anything that arrived while it was in flight.
      pending = [...retry, ...pending];
    } finally {
      inFlight = false;
      lockedUntil = clock.now() + SIMKL_WRITE_LOCK_MS;
      scheduleFlush();
    }
  }

  return {
    log(entry) {
      return new Promise<ProviderWriteResult>((resolve, reject) => {
        const waiter: Waiter = { entry, resolve, reject, retried: false };
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
