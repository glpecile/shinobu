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
import type { WatchlistEntry } from '@/features/watchlist/types';
import { deleteAniListEntry } from '@/lib/providers/anilist/writes';
import { removeFromLetterboxdWatchlist } from '@/lib/providers/letterboxd/watchlist-writes';
import { removeFromTraktWatchlist } from '@/lib/providers/trakt/writes';
import type { ProviderId } from '@/lib/providers/types';
import { anilistDeps } from '@/state/queries/anilist';
import { letterboxdDeps } from '@/state/queries/letterboxd';
import type { ProviderFailure } from '@/state/queries/settle';
import { traktDeps } from '@/state/queries/trakt';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import { invalidateAfterWatchlist, shouldRefreshNotifications } from './invalidate';
import {
  planWatchlistRemove,
  type UnwatchlistMediaVariables,
  type WatchlistRemovePayload,
} from './remove-targets';

/**
 * The removal verb (plan 0031 U16). **A second caller of `runProviderWrites`,
 * never a second core** (R38): the whole contract — per-provider outcomes in
 * routing order, upfront manual rows, `manualLinkForOutcome` semantics, the
 * shared `mutationKey` pending guard, `Effect.runPromise` at the boundary and
 * nowhere else — is the add's, reused verbatim with a different capability and
 * different copy. Every rule this file states beyond that is a rule the add
 * genuinely does not have: the `sources` restriction and R35's unknown-membership
 * bucket.
 */

/**
 * One entry per removal-capable provider — Trakt, AniList and (plan 0033)
 * Letterboxd, whose captured endpoint is a declarative state set: removing an
 * already-absent film is a 204 no-op, so the remove is safe even when the
 * paginated scrape read only part of the list.
 *
 * Serializd declares `watchlistRemove: 'manual'` and so has **no key here at
 * all**: it has no watchlist read leg in v1 (R32), which means it can never
 * appear in a `WatchlistEntry`'s `sources` and an adapter behind that would be
 * unreachable code. `removeFromSerializdWatchlist` exists (U9 shipped it, U10
 * probes it) and is deliberately **not on a live path** — routing never hands a
 * manual provider to `runProviderWrites`, whose missing-adapter path is a loud
 * error by design.
 *
 * Simkl is absent for the write gate alone (plan 0034 U6): its
 * `watchlistRemove` stays `'manual'` behind U4's live-probe gate — the
 * documented `/sync/history/remove` whole-item body removes watch *history*
 * along with the list entry. Unlike Serializd it *does* appear in a
 * `WatchlistEntry`'s `sources` now that U7's read leg feeds the gather, so a
 * removal reaches `planWatchlistRemove` and lands in the `manual` bucket — a
 * deep-link row (plan 0022), never a `runProviderWrites` target.
 * `removeFromSimklWatchlist` ships dormant in `simkl/writes.ts` so the
 * eventual flip is a one-token registry change, exactly like Serializd's.
 */
export const WATCHLIST_REMOVE_ADAPTERS: Partial<
  Record<ProviderId, WriteAdapter<WatchlistRemovePayload>>
> = {
  trakt: ({ item }) =>
    Effect.runPromise(removeFromTraktWatchlist(traktDeps(), item)),
  letterboxd: ({ item }) =>
    Effect.runPromise(removeFromLetterboxdWatchlist(letterboxdDeps(), item)),
  anilist: ({ item, allowDestructive }) => {
    const mediaId = item.externalIds.anilist;
    // Reachable only for an entry AniList's own leg produced, so this is
    // defensive rather than expected — and a reasoned skip rather than an error
    // because there is nothing wrong, there is simply nothing to delete by.
    if (mediaId == null) {
      return Promise.resolve({
        status: 'skipped' as const,
        reason: 'has no AniList id to remove by',
      });
    }
    // The delete's guard (a fresh read of status/progress/score/notes/custom
    // lists, R36) lives inside the effect, never here: reading the cached entry
    // to decide would be the stale guard KTD-2 prohibits. `allowDestructive`
    // lifts that guard's *refusal* only (plan 0035 R3) — the fresh read and the
    // fresh id still run — and only when the picker took an explicit confirm.
    return Effect.runPromise(
      deleteAniListEntry(anilistDeps(), {
        mediaId,
        ...(allowDestructive === true ? { allowDestructive: true } : {}),
      }),
    );
  },
};

/** The watchlist removal's report — the shared core's, plus this verb's own fields. */
export type UnwatchlistMediaResult = ProviderWriteReport & {
  /** The enriched item the removal actually ran against. */
  item: NormalizedMediaItem;
  /** Providers holding the item that are offered as a manual deep link (R17). */
  manual: ProviderId[];
  /** Providers whose membership was unknown (R35) — manual rows that also withhold "Removed". */
  unknown: ProviderId[];
};

/**
 * The two effectful seams of this verb, injected exactly as the add injects
 * them, so the *decisions* here are testable without a renderer, a network or a
 * process-wide module mock that would leak into every other suite.
 */
export interface WatchlistRemoveDeps {
  adapters: Partial<Record<ProviderId, WriteAdapter<WatchlistRemovePayload>>>;
  refresh: (queryClient: QueryClient, options: RefreshOptions) => Promise<void>;
}

export const watchlistRemoveDeps = (): WatchlistRemoveDeps => ({
  adapters: WATCHLIST_REMOVE_ADAPTERS,
  refresh: (queryClient, options) =>
    refreshNotifications(createRefreshDeps(queryClient), options),
});

const WATCHLIST_REMOVE_MUTATION_ROOT = ['watchlist-media-remove'] as const;

/**
 * Keyed on the **item**, not on the component instance (R18/R38) — and under
 * its own root, so an add and a removal of the same item are two different
 * in-flight writes to the guard rather than one. Nothing in the app can start
 * both at once today (the add row hides once every applicable provider holds
 * the item), but collapsing them would make that a silent assumption.
 */
export function watchlistRemoveMutationKey(itemId: string) {
  return [...WATCHLIST_REMOVE_MUTATION_ROOT, itemId] as const;
}

/** The exact filter the guard reads — exported as data so callers share one definition. */
export function watchlistRemovePendingFilter(itemId: string) {
  return {
    mutationKey: watchlistRemoveMutationKey(itemId),
    status: 'pending',
  } as const;
}

/**
 * R18's shared pending guard for this verb: is a removal for this item in
 * flight *anywhere* in the tree? pressto's press debounce is per-instance, and
 * the grid cell and the sheet opened over it are two instances.
 */
export function useIsUnwatchlistPending(itemId: string): boolean {
  return useMutationState({ filters: watchlistRemovePendingFilter(itemId) }).length > 0;
}

/**
 * The most recent removal report for this item, read from the shared mutation
 * cache for the same reason the add reads its own that way: the result surface
 * (failures, reasoned skips, their manual links) is a report about one write,
 * which no membership fact can carry, and only one of two mounts would
 * otherwise ever see it.
 */
export function useLatestUnwatchlistResult(
  itemId: string,
): UnwatchlistMediaResult | undefined {
  const results = useMutationState({
    filters: { mutationKey: watchlistRemoveMutationKey(itemId) },
    select: (mutation) => mutation.state.data as UnwatchlistMediaResult | undefined,
  });
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    if (result != null) return result;
  }
  return undefined;
}

/**
 * The whole removal, as a plain async function: plan → fan out → invalidate →
 * (maybe) reschedule notifications. Exported because it *is* the verb — the
 * hook below is a `useMutation` wrapper over it.
 */
export async function runWatchlistRemove(
  queryClient: QueryClient,
  entry: WatchlistEntry,
  connected: readonly ProviderId[],
  errors: readonly ProviderFailure[] = [],
  variables: UnwatchlistMediaVariables = {},
  deps: WatchlistRemoveDeps = watchlistRemoveDeps(),
  incomplete: readonly ProviderId[] = [],
): Promise<UnwatchlistMediaResult> {
  const plan = await planWatchlistRemove(
    queryClient,
    entry,
    connected,
    errors,
    variables,
    incomplete,
  );
  // Only when nothing at all can be offered — not even a link. A plan that is
  // entirely manual or entirely unknown is the deep-link affordance (R17/R35),
  // and throwing would turn it into the dead end plan 0022 exists to prevent.
  if (
    plan.targets.length === 0 &&
    plan.manual.length === 0 &&
    plan.unknown.length === 0
  ) {
    throw new Error(`No connected provider can remove "${plan.item.title}"`);
  }

  const report = await runProviderWrites(deps.adapters, plan.targets, {
    item: plan.item,
    ...(variables.allowDestructive === true ? { allowDestructive: true } : {}),
  });

  // Inside the mutation, never in `onSuccess` — the sheet this is invoked from
  // routinely unmounts before `onSuccess` would fire, and a hook observer that
  // is gone never runs its callback. **No optimistic patch** either (KTD-5):
  // the row leaves the grid when the refetch this schedules lands, so a failed
  // removal never has to be un-patched back into a list the user is looking at.
  invalidateAfterWatchlist(queryClient, plan.item, report.succeeded);

  if (
    report.succeeded.length > 0 &&
    shouldRefreshNotifications(plan.item, currentPlatform())
  ) {
    // Same gate as the add, for the mirror reason: a scheduled release
    // notification for something no longer on any watchlist is a notification
    // for a decision the user has just reversed.
    await deps.refresh(queryClient, { throttle: false });
  }

  return {
    ...report,
    item: plan.item,
    manual: plan.manual,
    unknown: plan.unknown,
  };
}

/**
 * The unified watchlist removal (plan 0031 U16): route to every connected
 * provider that *actually holds* the entry and fire the removals in parallel,
 * reporting one outcome per provider so a partial failure is visible rather
 * than collapsed (AGENTS.md).
 *
 * Takes the entry (and the gather's failed legs) at hook-call time rather than
 * as mutation variables, the same divergence from `useLogMedia`'s shape the add
 * makes: the `mutationKey` has to carry the item id for R18's cross-mount
 * pending guard to be readable, and a key cannot be built from variables that
 * don't exist until `mutate()`.
 */
export function useUnwatchlistMedia(
  entry: WatchlistEntry,
  errors: readonly ProviderFailure[] = [],
  incomplete: readonly ProviderId[] = [],
) {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: watchlistRemoveMutationKey(entry.item.id),
    mutationFn: (
      variables: UnwatchlistMediaVariables,
    ): Promise<UnwatchlistMediaResult> =>
      runWatchlistRemove(
        queryClient,
        entry,
        connected,
        errors,
        variables,
        watchlistRemoveDeps(),
        incomplete,
      ),
  });
}
