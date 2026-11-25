import { ProviderNetworkError, ProviderRateLimitError } from '@/lib/providers/errors';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

export interface LogMediaVariables {
  item: NormalizedMediaItem;
  /** Single episode watch (TV). Mutually exclusive with `episodes`. */
  episode?: { season: number; number: number };
  /** Mutually exclusive with `episode`. */
  episodes?: Array<{ season: number; number: number }>;
  /**
   * Entry-relative episode numbers (1..n, e.g. AniList). Mutually exclusive
   * with `episode`/`episodes` as caller input; `useLogMedia` adds canonical
   * `episodes` alongside it before invoking adapters.
   */
  entryEpisodes?: number[];
  /** ISO instant; omitted = providers record "now". */
  watchedAt?: string;
  reading?: { finished: true } | { finished: false; page: number };
  tags?: string[];
  liked?: boolean;
  /** Set by reconcile, never by callers. */
  rewatch?: boolean;
  providers?: ProviderId[];
  /**
   * Retry context from the prior round: `unsent` targets never left the device;
   * `unanswered` targets got no response and retry only where a read proves absence.
   */
  retryOf?: { rewatch: boolean; unsent?: readonly ProviderId[]; unanswered?: readonly ProviderId[] };
  /** Pending-log record id; skips targets whose watch-state read gets no answer. */
  replay?: string;
}

export type ProviderWriteResult =
  | { status: 'ok'; reason?: string }
  | { status: 'skipped'; reason: string };

export type WriteAdapter<V> = (variables: V) => Promise<ProviderWriteResult>;

export type ProviderWriteOutcome =
  | { provider: ProviderId; status: 'ok'; reason?: string }
  | {
      provider: ProviderId;
      status: 'error';
      message: string;
      /**
       * Set when a later try could succeed. `network`: no answer came back, so
       * the write may have landed. `rate-limit`: the provider refused it.
       */
      transient?: 'network' | 'rate-limit';
    }
  | { provider: ProviderId; status: 'queued' }
  /** Absent `reason` means already in sync (reconcile); a `reason` is an adapter skip. */
  | { provider: ProviderId; status: 'skipped'; reason?: string };

export interface ProviderWriteReport {
  /** One entry per applicable provider (skips included), in routing order. */
  outcomes: ProviderWriteOutcome[];
  succeeded: ProviderId[];
  failed: ProviderId[];
  skipped: ProviderId[];
}

export type LogMediaResult = ProviderWriteReport & {
  rewatch: boolean;
  queued: ProviderId[];
  unanswered?: readonly ProviderId[];
  /** Resolves once post-log invalidation refetches finish. */
  settled?: Promise<void>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function transientKind(error: unknown): 'network' | 'rate-limit' | undefined {
  if (error instanceof ProviderRateLimitError) return 'rate-limit';
  if (error instanceof ProviderNetworkError && error.status == null) return 'network';
  return undefined;
}

export async function runProviderWrites<V>(
  adapters: Partial<Record<ProviderId, WriteAdapter<V>>>,
  targets: readonly ProviderId[],
  variables: V,
): Promise<ProviderWriteReport> {
  const outcomes: ProviderWriteOutcome[] = await Promise.all(
    targets.map(async (provider): Promise<ProviderWriteOutcome> => {
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
        if (result != null && result.status === 'skipped') {
          return { provider, status: 'skipped', reason: result.reason };
        }
        if (result != null && result.reason != null) {
          return { provider, status: 'ok', reason: result.reason };
        }
        return { provider, status: 'ok' };
      } catch (error) {
        return { provider, status: 'error', message: errorMessage(error), transient: transientKind(error) };
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
    skipped: outcomes
      .filter((outcome) => outcome.status === 'skipped')
      .map((outcome) => outcome.provider),
  };
}

export function fanOutLog(
  adapters: Partial<Record<ProviderId, WriteAdapter<LogMediaVariables>>>,
  targets: readonly ProviderId[],
  variables: LogMediaVariables,
): Promise<ProviderWriteReport> {
  return runProviderWrites(adapters, targets, variables);
}
