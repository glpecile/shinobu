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
  /**
   * Diary tags — a Letterboxd-only concept in the fan-out (plan 0012): the
   * Letterboxd adapter sends them on the diary entry, every other adapter
   * ignores them.
   */
  tags?: string[];
  /**
   * Set by the reconcile step (plan 0011), never by callers: every target
   * already records this watch, so adapters log it as a rewatch (Trakt: a new
   * history entry; AniList: repeat+1 / REPEATING).
   */
  rewatch?: boolean;
  /**
   * Caller-override of which routed providers to actually write. The confirm
   * sheet uses this to let the user opt out of individual providers while
   * keeping the rest of the fan-out intact.
   */
  providers?: ProviderId[];
}

export type LogAdapter = (variables: LogMediaVariables) => Promise<void>;

export type ProviderLogOutcome =
  | { provider: ProviderId; status: 'ok' }
  | { provider: ProviderId; status: 'error'; message: string }
  /** Already in sync ahead of the others — deliberately not written (plan 0011). */
  | { provider: ProviderId; status: 'skipped' };

export interface LogMediaResult {
  /** One entry per applicable provider (skips included), in routing order. */
  outcomes: ProviderLogOutcome[];
  succeeded: ProviderId[];
  failed: ProviderId[];
  /** Providers that already recorded this watch and were left untouched. */
  skipped: ProviderId[];
  /** True when the write round was a parity rewatch (plan 0011). */
  rewatch: boolean;
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
    // The fan-out itself never skips — reconciliation removes skipped
    // providers from `targets` and merges their outcomes back in useLogMedia.
    skipped: [],
    rewatch: variables.rewatch === true,
  };
}
