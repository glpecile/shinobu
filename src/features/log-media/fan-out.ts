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
  /**
   * The *entry-relative* numbering domain (plan 0027 KTD2): an AniList entry
   * counts its own episodes 1..n, so a sequel-season entry's "episode 3" is
   * neither S01E03 nor S02E03 until ani.zip's table says which. AniList-origin
   * callers pass this — and never fabricate a season — while the AniList
   * adapter reads it verbatim.
   *
   * Mutually exclusive with `episode`/`episodes` **as caller input only**:
   * `useLogMedia` translates entry → canonical before `fanOutLog`, so the
   * variables an adapter sees carry both domains at once (Trakt and Serializd
   * read the canonical `episodes`, AniList reads these). When translation
   * fails, this is present and the canonical fields are absent — those two
   * providers are wrapped into reasoned skips rather than written (R3).
   */
  entryEpisodes?: number[];
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
 *
 * An `ok` may carry a `reason` naming what the write deliberately left alone
 * (plan 0031 R16): Serializd's watchlist add is season-keyed and its KTD-10
 * guard filters watched seasons out, so "added, except S1–S2 which are already
 * watched" is a success *with news* — a bare `ok` would tell the user
 * "watchlisted" after writing two of five seasons, and with no Serializd read
 * leg (R32) nothing downstream ever corrects the impression.
 */
export type ProviderWriteResult =
  | { status: 'ok'; reason?: string }
  | { status: 'skipped'; reason: string };

/**
 * One provider's write for *some* verb. Generic in its payload `V` because the
 * core is verb-neutral (plan 0031 KTD-4): the log verb passes
 * `LogMediaVariables`, the watchlist verbs pass their own payload, and the
 * partial-failure contract below is shared rather than re-derived per verb.
 */
export type WriteAdapter<V> = (variables: V) => Promise<ProviderWriteResult>;

export type ProviderWriteOutcome =
  /** Written — with an optional partial-write reason passed through (R16). */
  | { provider: ProviderId; status: 'ok'; reason?: string }
  | { provider: ProviderId; status: 'error'; message: string }
  /**
   * Left untouched: either already in sync ahead of the others (reconcile,
   * plan 0011, no `reason`), or an adapter-reported skip (plan 0017 R9, e.g. a
   * Serializd season that can't be resolved) carrying the reason.
   */
  | { provider: ProviderId; status: 'skipped'; reason?: string };

export interface ProviderWriteReport {
  /** One entry per applicable provider (skips included), in routing order. */
  outcomes: ProviderWriteOutcome[];
  succeeded: ProviderId[];
  failed: ProviderId[];
  /** Providers that already recorded this write and were left untouched. */
  skipped: ProviderId[];
}

/**
 * The log verb's report: the shared core's report plus the one field that is
 * genuinely log-specific (plan 0031 KTD-4). `useLogMedia` splices `rewatch`
 * back in from its own plan, so `runProviderWrites` stays payload-agnostic.
 */
export type LogMediaResult = ProviderWriteReport & {
  /** True when the write round was a parity rewatch (plan 0011). */
  rewatch: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The write half of the app (plan.md 1.3), kept pure for testing: fire every
 * target provider's adapter in parallel and report per-provider outcomes —
 * never one collapsed boolean/throw (AGENTS.md partial-failure contract).
 * A target without an adapter is a loud error outcome, not a silent skip.
 *
 * Verb-neutral and payload-generic (plan 0031 KTD-4): the log verb, the
 * watchlist add and the watchlist remove are all callers of *this* function,
 * never of a copy — the non-obvious rule below (the loud missing-adapter
 * error) is exactly what a second file would silently diverge on.
 */
export async function runProviderWrites<V>(
  adapters: Partial<Record<ProviderId, WriteAdapter<V>>>,
  targets: readonly ProviderId[],
  variables: V,
): Promise<ProviderWriteReport> {
  // Promise.all preserves input order, so `outcomes` lands in routing order
  // (ProviderWriteReport.outcomes contract); each thunk catches its own error.
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
        // An adapter-reported skip (plan 0017 R9) carries its reason
        // through as a non-failing outcome; anything else is a success.
        if (result != null && result.status === 'skipped') {
          return { provider, status: 'skipped', reason: result.reason };
        }
        // A partial-write reason rides along on the success (R16) — the
        // one field `SerializdWatchlistResult` exists to add.
        if (result != null && result.reason != null) {
          return { provider, status: 'ok', reason: result.reason };
        }
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
    // Reconcile-skips are merged back in useLogMedia; adapter-reported skips
    // (plan 0017 R9) surface here directly since the adapter ran.
    skipped: outcomes
      .filter((outcome) => outcome.status === 'skipped')
      .map((outcome) => outcome.provider),
  };
}

/**
 * The log verb's entry point into the shared core. Kept as its own symbol (and
 * in this file) so `todos/010`'s mechanism-word rename stays a one-file
 * exercise — plan 0031 KTD-4 deliberately leaves `fan-out.ts`/`fanOutLog`
 * alone and gives every *new* shared identifier a mechanism-free root.
 */
export function fanOutLog(
  adapters: Partial<Record<ProviderId, WriteAdapter<LogMediaVariables>>>,
  targets: readonly ProviderId[],
  variables: LogMediaVariables,
): Promise<ProviderWriteReport> {
  return runProviderWrites(adapters, targets, variables);
}
