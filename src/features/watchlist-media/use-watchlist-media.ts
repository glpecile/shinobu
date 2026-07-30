import {
  useMutation,
  useMutationState,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { Effect } from 'effect';

import {
  runProviderWrites,
  type ProviderWriteReport,
  type WriteAdapter,
} from '@/features/log-media/fan-out';
import { currentPlatform } from '@/features/log-media/use-log-targets';
import {
  createRefreshDeps,
  refreshNotifications,
  type RefreshOptions,
} from '@/features/notifications/refresh';
import { planOnAniList } from '@/lib/providers/anilist/writes';
import { addToLetterboxdWatchlist } from '@/lib/providers/letterboxd/watchlist-writes';
import { addToTraktWatchlist } from '@/lib/providers/trakt/writes';
import type { ProviderId } from '@/lib/providers/types';
import { anilistDeps } from '@/state/queries/anilist';
import { letterboxdDeps } from '@/state/queries/letterboxd';
import { traktDeps } from '@/state/queries/trakt';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import { invalidateAfterWatchlist, shouldRefreshNotifications } from './invalidate';
import {
  planWatchlistWrite,
  type WatchlistMediaVariables,
  type WatchlistWritePayload,
} from './targets';

/**
 * One entry per watchlist-write-capable provider. `Effect.runPromise` here is
 * the same containment boundary `state/queries/*` uses — no Effect type
 * escapes into this hook's signature or any component's.
 *
 * A provider declaring the verb `'manual'` has **no key here at all**, and
 * routing never hands it to `runProviderWrites`: the missing-adapter path is a
 * *loud error outcome* by design, so a manual target reaching it would read as
 * a bug rather than the deep-link affordance it actually is.
 *
 * Letterboxd joined in plan 0033: U6's capture classified the endpoint as a
 * declarative state set, discharging KTD-6, and `unsupportedWritePlatforms`
 * keeps it manual on web (no transport there). **Serializd** stays out — U9 has
 * landed `addToSerializdWatchlist`, the season guard and the Worker rules, but
 * the registry declaration stays `'manual'` until U10's account-bound probe
 * discharges KTD-10's named risk (see `registry.ts`, and
 * `docs/solutions/serializd-watchlist-endpoints.md` § standing rollback). Adding
 * the key here before that flip would not make the write live — routing would
 * still never reach it — so the adapter is deliberately imported by nothing, and
 * the registry token remains the single switch.
 */
export const WATCHLIST_ADAPTERS: Partial<
  Record<ProviderId, WriteAdapter<WatchlistWritePayload>>
> = {
  trakt: ({ item }) => Effect.runPromise(addToTraktWatchlist(traktDeps(), item)),
  anilist: ({ item }) => Effect.runPromise(planOnAniList(anilistDeps(), item)),
  letterboxd: ({ item }) =>
    Effect.runPromise(addToLetterboxdWatchlist(letterboxdDeps(), item)),
};

/** The watchlist add's report — the shared core's, plus this verb's own fields. */
export type WatchlistMediaResult = ProviderWriteReport & {
  /** The enriched item the write actually ran against. */
  item: NormalizedMediaItem;
  /** Applicable providers offered as a manual deep link instead (R17). */
  manual: ProviderId[];
};

/**
 * The two effectful seams of this verb, injected rather than imported at the
 * call site — the same `traktDeps()`/`createRefreshDeps()` pattern the rest of
 * the app uses, and what lets the *decisions* here be tested without a
 * renderer, a network, or a process-wide module mock that would leak into
 * every other suite.
 */
export interface WatchlistWriteDeps {
  adapters: Partial<Record<ProviderId, WriteAdapter<WatchlistWritePayload>>>;
  refresh: (queryClient: QueryClient, options: RefreshOptions) => Promise<void>;
}

export const watchlistWriteDeps = (): WatchlistWriteDeps => ({
  adapters: WATCHLIST_ADAPTERS,
  refresh: (queryClient, options) =>
    refreshNotifications(createRefreshDeps(queryClient), options),
});

const WATCHLIST_MUTATION_ROOT = ['watchlist-media'] as const;

/**
 * Keyed on the **item**, not on the component instance (R18). pressto's press
 * debounce is per-instance and per-mount `useMutation` state is too — neither
 * spans a card and the sheet opened over it, which is precisely the double-fire
 * this key defends against.
 */
export function watchlistMutationKey(itemId: string) {
  return [...WATCHLIST_MUTATION_ROOT, itemId] as const;
}

/**
 * The exact filter the guard reads. Exported as data so the hook below and any
 * non-React caller (tests, a future imperative guard) share one definition
 * rather than two that can drift.
 */
export function watchlistPendingFilter(itemId: string) {
  return { mutationKey: watchlistMutationKey(itemId), status: 'pending' } as const;
}

/**
 * R18's shared pending guard: is a watchlist write for this item in flight
 * *anywhere* in the tree? `useMutationState` reads the shared mutation cache,
 * so a card and the sheet over it see the same answer.
 */
export function useIsWatchlistWritePending(itemId: string): boolean {
  return useMutationState({ filters: watchlistPendingFilter(itemId) }).length > 0;
}

/**
 * The most recent report for this item, read from the same shared cache as the
 * pending guard (R14/R18). Shared rather than per-mount for the same reason:
 * the card and the sheet opened over it are two `useMutation` instances, and
 * only one of them would otherwise ever see the outcome.
 *
 * It is **no longer** the settled label's truth source — U15 moved that to
 * `useIsWatchlisted` (KTD-14). This reader stays because the *result surface*
 * (failures, reasoned skips, their manual links) is a report about one write,
 * which no membership fact can carry.
 */
export function useLatestWatchlistResult(
  itemId: string,
): WatchlistMediaResult | undefined {
  const results = useMutationState({
    filters: { mutationKey: watchlistMutationKey(itemId) },
    select: (mutation) => mutation.state.data as WatchlistMediaResult | undefined,
  });
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    if (result != null) return result;
  }
  return undefined;
}

/**
 * The whole write, as a plain async function: plan → fan out → invalidate →
 * (maybe) reschedule notifications. Exported because it *is* the verb — the
 * hook below is a `useMutation` wrapper over it, and testing the behaviour
 * without a renderer is only possible because the behaviour lives here.
 */
export async function runWatchlistWrite(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
  connected: readonly ProviderId[],
  variables: WatchlistMediaVariables = {},
  deps: WatchlistWriteDeps = watchlistWriteDeps(),
): Promise<WatchlistMediaResult> {
  const plan = await planWatchlistWrite(queryClient, item, connected, variables);
  // Only when *no* connected provider applies at all. A plan that is entirely
  // manual is not an error — it is the deep-link affordance (R17), and
  // throwing here would turn it into the dead end plan 0022 exists to prevent.
  if (plan.targets.length === 0 && plan.manual.length === 0) {
    throw new Error(`No connected provider can watchlist "${plan.item.title}"`);
  }

  const report = await runProviderWrites(deps.adapters, plan.targets, {
    item: plan.item,
  });

  // Both of the steps below run *here*, inside the mutation, never in
  // `onSuccess`. Two reasons: they need the enriched item this function owns
  // (the caller's copy may lack ids the plan discovered), and — the plan 0031
  // one — the sheet entry point routinely unmounts before `onSuccess` would
  // fire, and a hook observer that is gone never runs its callback. Cache
  // coherence cannot be contingent on a component still being mounted.
  invalidateAfterWatchlist(queryClient, plan.item, report.succeeded);

  if (
    report.succeeded.length > 0 &&
    shouldRefreshNotifications(plan.item, currentPlatform())
  ) {
    // `throttle: false` because the schedule genuinely changed — the gate above
    // is what keeps that bypass from becoming the default.
    await deps.refresh(queryClient, { throttle: false });
  }

  return { ...report, item: plan.item, manual: plan.manual };
}

/**
 * The unified watchlist add (plan 0031): route to every connected provider
 * applicable to the item and fire the adds in parallel — never a
 * single-provider write (AGENTS.md) — reporting one outcome per applicable
 * provider so a partial failure is visible rather than collapsed.
 *
 * Takes the item at hook-call time rather than as mutation variables, which is
 * the one place it diverges from `useLogMedia`'s shape: the `mutationKey` has
 * to carry the item id for R18's cross-mount pending guard to be readable, and
 * a key cannot be built from variables that don't exist until `mutate()`.
 */
export function useWatchlistMedia(item: NormalizedMediaItem) {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: watchlistMutationKey(item.id),
    mutationFn: (variables: WatchlistMediaVariables): Promise<WatchlistMediaResult> =>
      runWatchlistWrite(queryClient, item, connected, variables),
  });
}
