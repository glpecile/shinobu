import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

export interface LogMediaVariables {
  item: NormalizedMediaItem;
  /** Single episode watch (TV). Mutually exclusive with `episodes`. */
  episode?: { season: number; number: number };
  /**
   * One or more episode watches for the same show (TV) — a whole-season log
   * passes every episode of that season, so the fan-out is one request per
   * provider, not N. Mutually exclusive with `episode`.
   */
  episodes?: Array<{ season: number; number: number }>;
  /** ISO instant; omitted = providers record "now". */
  watchedAt?: string;
}

export type LogAdapter = (variables: LogMediaVariables) => Promise<void>;

export type ProviderLogOutcome =
  | { provider: ProviderId; status: 'ok' }
  | { provider: ProviderId; status: 'error'; message: string };

export interface LogMediaResult {
  /** One entry per target provider, in routing order. */
  outcomes: ProviderLogOutcome[];
  succeeded: ProviderId[];
  failed: ProviderId[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The write half of the app (plan.md 1.3), kept pure for testing: fire every
 * target provider's adapter in parallel and report per-provider outcomes —
 * never one collapsed boolean/throw (AGENTS.md partial-failure contract).
 * A target without an adapter is a loud error outcome, not a silent skip.
 */
export async function fanOutLog(
  adapters: Partial<Record<ProviderId, LogAdapter>>,
  targets: readonly ProviderId[],
  variables: LogMediaVariables,
): Promise<LogMediaResult> {
  const outcomes = await Promise.all(
    targets.map(async (provider): Promise<ProviderLogOutcome> => {
      const adapter = adapters[provider];
      if (adapter == null) {
        return {
          provider,
          status: 'error',
          message: `${provider} write adapter is not implemented yet`,
        };
      }
      try {
        await adapter(variables);
        return { provider, status: 'ok' };
      } catch (error) {
        return { provider, status: 'error', message: errorMessage(error) };
      }
    }),
  );

  return {
    outcomes,
    succeeded: outcomes
      .filter((outcome) => outcome.status === 'ok')
      .map((outcome) => outcome.provider),
    failed: outcomes
      .filter((outcome) => outcome.status === 'error')
      .map((outcome) => outcome.provider),
  };
}
