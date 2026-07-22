import { all } from 'better-all';

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

/**
 * What one provider's write adapter resolves: a successful write, or a
 * deliberate skip carrying the reason it couldn't proceed (plan 0017 R9) — e.g.
 * Serializd cannot resolve a `seasonId`, or a routed item lacks the `tmdb` join
 * key. A skip is a *success value*, not a thrown error, so it reports through
 * the contract instead of failing the fan-out. Adapters with nothing to report
 * resolve `{ status: 'ok' }`.
 */
export type LogWriteResult =
  | { status: 'ok' }
  | { status: 'skipped'; reason: string };

export type LogAdapter = (variables: LogMediaVariables) => Promise<LogWriteResult>;

export type ProviderLogOutcome =
  | { provider: ProviderId; status: 'ok' }
  | { provider: ProviderId; status: 'error'; message: string }
  /**
   * Left untouched: either already in sync ahead of the others (reconcile,
   * plan 0011, no `reason`), or an adapter-reported skip (plan 0017 R9, e.g. a
   * Serializd season that can't be resolved) carrying the reason.
   */
  | { provider: ProviderId; status: 'skipped'; reason?: string };

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
  const outcomesByProvider = await all(
    Object.fromEntries(
      targets.map(
        (provider): [ProviderId, () => Promise<ProviderLogOutcome>] => [
          provider,
          async () => {
            const adapter = adapters[provider];
            if (adapter == null) {
              return {
                provider,
                status: 'error',
                message: `${provider} write adapter is not implemented yet`,
              };
            }
            try {
              const result = await adapter(variables);
              // An adapter-reported skip (plan 0017 R9) carries its reason
              // through as a non-failing outcome; anything else is a success.
              if (result != null && result.status === 'skipped') {
                return { provider, status: 'skipped', reason: result.reason };
              }
              return { provider, status: 'ok' };
            } catch (error) {
              return { provider, status: 'error', message: errorMessage(error) };
            }
          },
        ],
      ),
    ),
  );
  // better-all keys its result in completion order, not input order — rebuild
  // routing order from `targets` (LogMediaResult.outcomes contract).
  const outcomes: ProviderLogOutcome[] = targets.map(
    (provider) => outcomesByProvider[provider],
  );

  return {
    outcomes,
    succeeded: outcomes
      .filter((outcome) => outcome.status === 'ok')
      .map((outcome) => outcome.provider),
    failed: outcomes
      .filter((outcome) => outcome.status === 'error')
      .map((outcome) => outcome.provider),
    // Reconcile-skips are merged back in useLogMedia; adapter-reported skips
    // (plan 0017 R9) surface here directly since the adapter ran.
    skipped: outcomes
      .filter((outcome) => outcome.status === 'skipped')
      .map((outcome) => outcome.provider),
    rewatch: variables.rewatch === true,
  };
}
