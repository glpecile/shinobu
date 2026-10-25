import type { ProviderId } from '@/lib/providers/types';

/**
 * The gatherers' shared partial-failure contract (plan 0031 R26). Lifted out of
 * `up-next.ts` — where it was born (plan 0019 R7) — rather than copied into the
 * watchlist gatherer, because two copies of "how a provider fails" is exactly
 * the divergence the fan-out's partial-failure rule exists to prevent: one
 * copy grows a rethrow, a swallow or a different error shape, and a surface
 * quietly starts blanking on a single provider outage.
 *
 * Deliberately React-free and Effect-free: it is called from `queryFn` bodies
 * on both sides of the boundary and is unit-testable on its own.
 */

/** One provider's read failing — surfaced, never silently empty. */
export interface ProviderFailure {
  provider: ProviderId;
  message: string;
}

export interface ProviderContribution<Input> {
  inputs: Input[];
  errors: ProviderFailure[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A disconnected provider contributes nothing — and that is not an error. */
export function none<Input>(): ProviderContribution<Input> {
  return { inputs: [], errors: [] };
}

/** One provider's contribution, with its failure captured instead of thrown. */
export async function settle<Input>(
  provider: ProviderId,
  run: () => Promise<Input[]>,
): Promise<ProviderContribution<Input>> {
  try {
    return { inputs: await run(), errors: [] };
  } catch (error: unknown) {
    return { inputs: [], errors: [{ provider, message: errorMessage(error) }] };
  }
}

type Settled<Legs extends readonly unknown[]> = { [K in keyof Legs]: Legs[K] | undefined };

/**
 * Streams a gather into `streamedQuery`: each time a leg settles, yields
 * `merge` of the legs settled so far (the rest are `undefined`) when that is
 * `worthShowing`, and always yields the complete merge last. Legs come from
 * `settle`/`none`, so none of them rejects.
 */
export async function* streamLegs<Legs extends readonly unknown[] | [], Merged>(
  legs: { [K in keyof Legs]: Legs[K] | Promise<Legs[K]> },
  merge: (settled: Settled<Legs>) => Merged,
  worthShowing: (partial: Merged) => boolean,
): AsyncGenerator<Merged> {
  const settled: unknown[] = legs.map(() => undefined);
  let settledCount = 0;
  let shownCount = 0;
  const pending = new Map(
    legs.map((leg: unknown, index) => [
      index,
      Promise.resolve(leg).then((value) => {
        settled[index] = value;
        settledCount += 1;
        return index;
      }),
    ]),
  );
  while (pending.size > 0) {
    pending.delete(await Promise.race(pending.values()));
    // Legs settling in one tick are raced out one by one; show them once.
    if (settledCount === shownCount) continue;
    const merged = merge([...settled] as Settled<Legs>);
    if (settledCount === legs.length || worthShowing(merged)) {
      shownCount = settledCount;
      yield merged;
    }
  }
}
