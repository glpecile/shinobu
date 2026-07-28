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
