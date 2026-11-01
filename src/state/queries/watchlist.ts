import {
  experimental_streamedQuery as streamedQuery,
  hashKey,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import type { WatchlistInput, WatchlistInputs } from '@/features/watchlist/types';
import { WATCHLIST_PAGE_SIZE } from '@/lib/providers/letterboxd/watchlist';
import { providersForFeed } from '@/lib/providers/routing';
import { getAllItems } from '@/lib/providers/simkl/reads';
import { getWatchlist } from '@/lib/providers/trakt/reads';
import type { ProviderId } from '@/lib/providers/types';
import { currentUsableProviders, useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import type { NormalizedMediaItem } from '@/types/media';

import { anilistQueryKeys, fetchWatchlistAnime } from './anilist';
import { letterboxdQueryKeys, letterboxdWatchlistPagesOptions } from './letterboxd';
import { none, settle, streamLegs } from './settle';
import { simklDeps, simklQueryKeys } from './simkl';
import { traktDeps, traktQueryKeys } from './trakt';
import { WATCHLIST_QUERY_ROOT } from './watchlist-cache';

/**
 * The cross-provider watchlist gatherer (plan 0031 U13/R26). Same shape as
 * `up-next.ts`: raw per-provider inputs cached under one key, merged by a pure
 * function (`features/watchlist/compute.ts`) at render time — never in the
 * `queryFn`, so a hide or a second Letterboxd page re-merges without a refetch.
 *
 * Every leg settles **independently** through the shared `settle` helper: one
 * provider's outage costs that provider's rows and an inline notice, never the
 * grid (R29/KTD-12).
 *
 * Effect stays inside the `queryFn`s here — the AGENTS.md containment boundary.
 * No `Effect<…>` appears in any exported signature.
 */

export const watchlistQueryKeys = {
  /** Shared root so the disconnect purge in `state/session` can't drift. */
  all: [...WATCHLIST_QUERY_ROOT],
  /** The gathered rows — persisted, and what a successful add invalidates. */
  inputs: () => [...watchlistQueryKeys.all, 'inputs'] as const,
};

/** Listen only for changes to the gathered inputs, not query creation elsewhere during render. */
export function subscribeWatchlistInputs(
  queryClient: QueryClient,
  onStoreChange: () => void,
) {
  const inputsHash = hashKey(watchlistQueryKeys.inputs());
  return queryClient.getQueryCache().subscribe((event) => {
    if (
      (event.type === 'updated' || event.type === 'removed') &&
      event.query.queryHash === inputsHash
    ) {
      onStoreChange();
    }
  });
}

/**
 * A watchlist changes only when the user changes it, and the user's own changes
 * are event-driven (`invalidateAfterWatchlist` names this key), so staleness
 * only ever covers another device's edits — 15 minutes plus pull-to-refresh.
 * Matches `CALENDAR_STALE_MS` / `CATALOGUE_STALE_MS`.
 */
export const WATCHLIST_STALE_MS = 15 * 60_000;

export type { WatchlistInput, WatchlistInputs };

/**
 * The providers that contribute a watchlist read. **Not** every readable
 * provider: Serializd is deliberately absent (R32 — its endpoint is known and
 * cheap, but its `items[]` element shape is unverified). Named once so the
 * gather's legs below and the home row's mount gate
 * (`app/(tabs)/index.tsx`, R25) can never disagree about who has a watchlist.
 *
 * Simkl joined in U7: its `/sync/all-items` shape was already live-verified
 * against a real account in U3 (the normalized `SimklLibraryEntry`/
 * `normalizeAllItems` fixtures) — the same live-verification bar Serializd is
 * still held to above before it can join this list.
 */
const WATCHLIST_READ_PROVIDERS: readonly ProviderId[] = [
  'trakt',
  'anilist',
  'letterboxd',
  'simkl',
];

/**
 * Which of the connected providers this surface can actually read from — the
 * row's mount gate is `length > 0`, which is what finally gives a Trakt-only or
 * AniList-only user a watchlist row (R25).
 */
export function watchlistReadProviders(
  connected: readonly ProviderId[],
): ProviderId[] {
  return providersForFeed(connected).filter((id) =>
    WATCHLIST_READ_PROVIDERS.includes(id),
  );
}

/**
 * Trakt's leg: **one** call, `type=all`. Not split into movies + shows — they
 * are one endpoint, so there is no independent shows outage to isolate, and a
 * second request would only widen the ~7-concurrent mount-time burst
 * (docs/solutions/trakt-transient-network-errors.md). `added/desc` because
 * `addedAt` is what the merged grid sorts by; `rank` is Trakt's own default and
 * a Trakt-side concept this app must not silently reorder.
 */
async function traktInputs(queryClient: QueryClient): Promise<WatchlistInput[]> {
  const items = await queryClient.fetchQuery({
    queryKey: traktQueryKeys.watchlist('all', 'added', 'desc'),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        getWatchlist(traktDeps(), { type: 'all', sortBy: 'added', sortHow: 'desc' }),
        { signal },
      ),
    staleTime: WATCHLIST_STALE_MS,
  });
  // `normalizeWatchlistRow` puts `listed_at` in `lastUpdated` precisely so the
  // merge can order by add-time (KTD-11); `nowIso` would make every row equal.
  return items.map((item) => ({ item, source: 'trakt', addedAt: item.lastUpdated }));
}

/**
 * AniList's leg: a **selector over an already-cached read**, costing zero extra
 * requests warm. Plan 0030 widened the one list request to
 * `status_in: [CURRENT, PLANNING]`, so both slices are already in the cache —
 * never "fix" this by adding a status query (30 req/min budget,
 * docs/solutions/anilist-rate-limit-retry-storm.md).
 *
 * Reads **CURRENT ∪ PLANNING** (plan 0035 R1): an anime you are watching is
 * watchlisted. That is `fetchWatchlistAnime`, a fourth selector — the other
 * three keep their narrower slices, which is what leaves the status gate
 * (`docs/solutions/anilist-shared-list-query-status-gate.md`) intact.
 *
 * No `addedAt`: `MediaList.createdAt` is not part of that shared selection, and
 * widening it to sort one surface is not worth changing the read every other
 * consumer depends on. These rows sort into the undated block.
 */
async function anilistInputs(queryClient: QueryClient): Promise<WatchlistInput[]> {
  const entries = await fetchWatchlistAnime(queryClient);
  return entries.map((entry) => ({
    item: entry.item,
    source: 'anilist',
    anilistStatus: entry.status,
    ...(entry.entryId != null ? { entryId: entry.entryId } : {}),
  }));
}

/** The infinite watchlist entry as the grid holds it: one page per cursor. */
interface WatchlistPages {
  pages: NormalizedMediaItem[][];
}

/**
 * Letterboxd's leg: **`pages.flat()` of the infinite entry**, not the feed
 * row's separate page-1 key. That is load-bearing — the grid pages a 600-film
 * watchlist behind `onEndReached`, and reading only page 1 would both truncate
 * the merge input to 28 films and make every page-2 film that is also on Trakt
 * render as a visible duplicate of a row already on screen instead of merging.
 *
 * Cold it is one page (`pages: 1`), so the cost is unchanged; warm it refetches
 * only the pages already loaded, which is what the grid's own refetch does.
 * The list is **never** auto-paged here to complete dedupe — 22 sequential
 * fetches on mobile data per gather is exactly what plan 0031's scope boundary
 * rules out. Page 1 reads through the feed row's entry, which Up Next's
 * releases share, so the three surfaces cost one scrape.
 */
/**
 * Whether Letterboxd's leg has read the user's whole watchlist, judged from the
 * same cached infinite entry the leg itself resolves to.
 *
 * A full last page means `getNextPageParam` handed out another cursor, so there
 * are films this gather has not seen. That is not a failure and never renders a
 * notice — but it is the difference between "Letterboxd does not have this film"
 * and "we have not looked", which R35 requires the removal path to tell apart.
 */
function letterboxdLegIsComplete(queryClient: QueryClient): boolean {
  const username = getLetterboxdUsername() ?? '';
  if (username === '') return true;
  const cached = queryClient.getQueryData<WatchlistPages>(
    letterboxdQueryKeys.watchlistPages(username),
  );
  const lastPage = cached?.pages.at(-1);
  return lastPage == null || lastPage.length < WATCHLIST_PAGE_SIZE;
}

async function letterboxdInputs(queryClient: QueryClient): Promise<WatchlistInput[]> {
  const username = getLetterboxdUsername() ?? '';
  if (username === '') return [];
  const queryKey = letterboxdQueryKeys.watchlistPages(username);
  const cached = queryClient.getQueryData<WatchlistPages>(queryKey);
  const data = await queryClient.fetchInfiniteQuery({
    ...letterboxdWatchlistPagesOptions(queryClient, username),
    pages: Math.max(cached?.pages.length ?? 1, 1),
    staleTime: WATCHLIST_STALE_MS,
  });
  return data.pages.flat().map((item) => ({ item, source: 'letterboxd' }));
}

/**
 * Simkl's leg (plan 0034 U7): one `status=plantowatch` snapshot across every
 * bucket, the same one-call-not-a-loop shape as Trakt's `type=all` above —
 * Simkl's path grammar puts a bare status filter under the `all` type segment
 * (`getAllItems`), so shows/movies/anime all come back in one request.
 * `addedToWatchlistAt` is Simkl's `added_to_watchlist_at`, the merge's sort
 * key exactly like Trakt's `listed_at`; absent when Simkl didn't record one.
 */
async function simklInputs(queryClient: QueryClient): Promise<WatchlistInput[]> {
  const library = await queryClient.fetchQuery({
    queryKey: simklQueryKeys.allItems(undefined, 'plantowatch'),
    queryFn: ({ signal }) =>
      Effect.runPromise(getAllItems(simklDeps(), { status: 'plantowatch' }), { signal }),
    staleTime: WATCHLIST_STALE_MS,
  });
  const entries = [...library.shows, ...library.movies, ...library.anime];
  return entries.map((entry) => ({
    item: entry.item,
    source: 'simkl',
    ...(entry.addedToWatchlistAt != null
      ? { addedAt: entry.addedToWatchlistAt }
      : {}),
    // The picker's destructive warning (plan 0036) — carried on every row, not
    // only the non-zero ones, so "we looked and it holds nothing" is a fact the
    // merge states rather than an absence it has to guess at. A hint: the
    // adapter's own fresh read is the authority, and takes the stricter of this
    // count and the per-episode array.
    simklWatchedCount: entry.item.currentProgress,
  }));
}

/**
 * Every connected provider's watchlist, gathered in parallel and settled
 * per-leg. **No Serializd leg** (R32): its endpoint is known and cheap, but its
 * `items[]` element shape is unverified against a real account and writing a
 * normalizer against a guess is how a data contract rots. The consequence is
 * stated rather than absorbed — v1 writes to a Serializd watchlist it cannot
 * show back, which is also why Serializd's removal stays a manual link.
 *
 * **Never a Calendar source** (R22): plan 0030 KTD-2 deliberately chose
 * `/calendars/my/*` over `/sync/watchlist` + per-item resolution, so this
 * gatherer feeds the watchlist surface only and `fetchUpNextInputs` never
 * calls it.
 */
function streamWatchlistInputs(
  queryClient: QueryClient,
  connected: readonly ProviderId[],
): AsyncGenerator<WatchlistInputs> {
  const feedProviders = watchlistReadProviders(connected);
  return streamLegs(
    // In `WATCHLIST_READ_PROVIDERS` order: `incomplete` finds a leg by its index.
    [
      feedProviders.includes('trakt')
        ? settle('trakt', () => traktInputs(queryClient))
        : none<WatchlistInput>(),
      feedProviders.includes('anilist')
        ? settle('anilist', () => anilistInputs(queryClient))
        : none<WatchlistInput>(),
      feedProviders.includes('letterboxd')
        ? settle('letterboxd', () => letterboxdInputs(queryClient))
        : none<WatchlistInput>(),
      feedProviders.includes('simkl')
        ? settle('simkl', () => simklInputs(queryClient))
        : none<WatchlistInput>(),
    ],
    (legs) => {
      const [trakt, anilist, letterboxd, simkl] = legs.map(
        (leg) => leg ?? none<WatchlistInput>(),
      );
      // A leg still streaming in is *incomplete*, as is a Letterboxd leg with
      // unread pages. A failed one is already `errors`, and R35 treats both as
      // unknown membership, so reporting it twice would only make the two lists
      // overlap.
      const incomplete = WATCHLIST_READ_PROVIDERS.filter((provider, index) =>
        feedProviders.includes(provider) &&
        (legs[index] == null ||
          (provider === 'letterboxd' &&
            letterboxd.errors.length === 0 &&
            !letterboxdLegIsComplete(queryClient))),
      );
      return {
        inputs: [...trakt.inputs, ...anilist.inputs, ...letterboxd.inputs, ...simkl.inputs],
        errors: [...trakt.errors, ...anilist.errors, ...letterboxd.errors, ...simkl.errors],
        incomplete,
      };
    },
    (partial) => partial.inputs.length > 0,
  );
}

const NO_WATCHLIST_INPUTS: WatchlistInputs = { inputs: [], errors: [], incomplete: [] };

export async function fetchWatchlistInputs(
  queryClient: QueryClient,
  connected: readonly ProviderId[],
): Promise<WatchlistInputs> {
  let inputs = NO_WATCHLIST_INPUTS;
  for await (const partial of streamWatchlistInputs(queryClient, connected)) inputs = partial;
  return inputs;
}

/**
 * Streams like `upNextOptions`: a cold grid renders once the first provider
 * with rows settles, and a refetch holds the old inputs until all are back.
 */
export function watchlistOptions(queryClient: QueryClient) {
  return {
    queryKey: watchlistQueryKeys.inputs(),
    queryFn: streamedQuery<WatchlistInputs, WatchlistInputs>({
      streamFn: (context) => {
        // Reading the signal lets streamedQuery stop cache writes after a purge.
        void context.signal;
        return streamWatchlistInputs(queryClient, currentUsableProviders());
      },
      reducer: (_previous, partial) => partial,
      initialValue: NO_WATCHLIST_INPUTS,
      refetchMode: 'replace',
    }),
    staleTime: WATCHLIST_STALE_MS,
  };
}

/**
 * Pull-to-refresh, and the retry behind a failed leg's inline notice (R29).
 *
 * Marks **each leg's own cache entry** stale before refetching the gather. The
 * legs are read through `fetchQuery`/`fetchInfiniteQuery` under a 15-minute
 * `staleTime`, so refetching the gather alone would re-serve exactly the
 * payloads the user pulled to replace — the same "provider keys first, then the
 * gatherer" ordering `invalidateAfterWatchlist` follows, for the same reason.
 *
 * The AniList entry it invalidates is the *shared* list read behind the "Your
 * Anime" row: this refreshes the network read those surfaces already share, it
 * does not change what either of them displays (R28).
 */
export async function refreshWatchlistInputs(
  queryClient: QueryClient,
): Promise<void> {
  const username = getLetterboxdUsername();
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: traktQueryKeys.watchlistRoot() }),
    queryClient.invalidateQueries({
      queryKey: anilistQueryKeys.currentAnimeEntries(),
    }),
    // The prefix, not the exact `status=plantowatch` key: a stale write
    // elsewhere (a log moving an item out of `plantowatch`) can't be known
    // here, so every cached all-items filter is marked stale together, same
    // as `invalidateAfterLog`'s Simkl branch.
    queryClient.invalidateQueries({ queryKey: simklQueryKeys.allItemsRoot() }),
    ...(username == null
      ? []
      : [
          // Invalidate page 1 before an active grid can refetch through it.
          queryClient.invalidateQueries({
            queryKey: letterboxdQueryKeys.watchlist(username),
          }),
          queryClient.invalidateQueries({
            queryKey: letterboxdQueryKeys.watchlistPages(username),
          }),
        ]),
  ]);
  await queryClient.refetchQueries({ queryKey: watchlistQueryKeys.inputs() });
}

/**
 * The raw gathered inputs, suspended. Consumers want *entries*, so they go
 * through `features/watchlist/use-watchlist-entries.ts` — this exists for it
 * and for tests, not as a screen-level hook.
 */
export function useSuspenseWatchlistInputsQuery(): WatchlistInputs {
  const queryClient = useQueryClient();
  // Rebinds after a purge, like `useSuspenseUpNextQuery`.
  useConnectedProviders();
  return useSuspenseQuery(watchlistOptions(queryClient)).data;
}
