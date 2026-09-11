/**
 * AniList's budget is 30 req/min (docs/solutions/web-cors-anilist.md), and one
 * `logToAniList` costs **two** requests — `getEntryState` then
 * `SaveMediaListEntry`. A catch-up chain (plan 0037) of eight episodes spent
 * sixteen of them, plus the invalidation refetches each success triggers, and
 * the tail of the chain came back `rate limited — try again shortly`.
 *
 * It spent them saying the same thing eight times. AniList stores progress as
 * **one counter per entry**: writing 3, then 4, … then 10 leaves exactly what
 * writing 10 alone leaves — the intermediate values are overwritten, not
 * recorded. So writes that pile up behind an in-flight one *for the same entry*
 * collapse into a single write carrying the highest progress, and every folded
 * caller resolves with that write's result. Eight episodes cost one or two
 * round-trips instead of sixteen.
 *
 * This replaces the plain serialization that lived in `use-log-media.ts`, and
 * keeps its guarantee: never two AniList writes in flight at once, so a slow
 * episode-4 write can't land after episode 5's and *regress* the counter.
 *
 * A write also waits a **settle window** after the previous one lands before
 * going out. Folding only what arrives mid-flight barely folds anything when
 * the round-trip is quicker than the user's thumb — press, land, press, land —
 * which is how a ten-episode chain still cost ten writes. The window is what
 * makes the fold reliable, and it doubles as request spacing against the
 * 30/min budget. It costs the user nothing: the counter's end state is the
 * same, and the sheet stays open until its writes settle.
 *
 * Deliberately not a retry or a backoff. `lib/providers/anilist/http.ts`
 * already sleeps once on a `Retry-After`; retrying harder inside the window is
 * the storm this app has already paid for once
 * (docs/solutions/anilist-rate-limit-retry-storm.md). The fix is to ask for
 * less, not to ask again.
 */

/**
 * How long a landed write holds the queue before the next batch goes out —
 * the window arrivals fold into. Long enough to cover a fast thumb between
 * two confirms, short enough that a single log still reads as immediate (the
 * first write of a chain never waits: the queue is idle when it arrives).
 */
const FOLD_WINDOW_MS = 900;

/** Test seam: real timers in the app, hand-driven ones in `bun test`. */
export interface FoldClock {
  schedule: (run: () => void, ms: number) => void;
}

const REAL_CLOCK: FoldClock = {
  schedule: (run, ms) => {
    setTimeout(run, ms);
  },
};

interface Waiter<T> {
  /** Writes sharing a key are interchangeable — see `submit`. */
  key: string | null;
  rank: number;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

export interface AniListWriteQueue {
  /**
   * Run `run`, one AniList write at a time.
   *
   * A non-null `key` means "this write is interchangeable with any other
   * waiting write of the same key, and the one with the highest `rank` says
   * everything the others do" — the caller keys on the entry (plus whether it
   * is a rewatch, which is a different mutation) and ranks by progress. A
   * `null` key never folds: a film's `repeat` counter *increments*, so two
   * rewatch logs are two facts, not one repeated.
   */
  submit: <T>(key: string | null, rank: number, run: () => Promise<T>) => Promise<T>;
}

export function createAniListWriteQueue(
  clock: FoldClock = REAL_CLOCK,
): AniListWriteQueue {
  let inFlight = false;
  let settling = false;
  // Mixed element types by construction — one queue serves every write shape.
  const pending: Waiter<unknown>[] = [];

  function drain(): void {
    if (inFlight || settling || pending.length === 0) return;
    // The oldest waiter picks the batch, so nothing can be starved by a
    // livelier key arriving behind it.
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
        // The folded writes were never sent as themselves, so they share the
        // winner's failure — which is the truth: the entry did not move.
        for (const waiter of batch) waiter.reject(error);
        settle();
      },
    );
  }

  function settle(): void {
    inFlight = false;
    settling = true;
    clock.schedule(() => {
      settling = false;
      drain();
    }, FOLD_WINDOW_MS);
  }

  return {
    submit(key, rank, run) {
      return new Promise((resolve, reject) => {
        pending.push({ key, rank, run, resolve, reject } as unknown as Waiter<unknown>);
        drain();
      });
    },
  };
}
