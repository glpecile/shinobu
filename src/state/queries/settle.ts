import type { ProviderId } from '@/lib/providers/types';

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

export function none<Input>(): ProviderContribution<Input> {
  return { inputs: [], errors: [] };
}

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

/** Yields partial merges when `worthShowing` holds, and always yields the final merge last. Expects non-rejecting legs. */
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
    if (settledCount === shownCount) continue;
    const merged = merge([...settled] as Settled<Legs>);
    if (settledCount === legs.length || worthShowing(merged)) {
      shownCount = settledCount;
      yield merged;
    }
  }
}
