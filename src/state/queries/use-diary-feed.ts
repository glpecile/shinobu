import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import { allSettled } from 'better-all';
import { Effect } from 'effect';

import { getListActivity, getViewerId } from '@/lib/providers/anilist/reads';
import { getDiary } from '@/lib/providers/letterboxd/diary';
import { providersForFeed } from '@/lib/providers/routing';
import { getHistory } from '@/lib/providers/trakt/reads';
import type { ProviderId } from '@/lib/providers/types';
import type { DiaryDay, NormalizedDiaryEntry } from '@/types/media';
import {
  groupDiaryEntries,
  mergeDiaryEntries,
  watermarkProviders,
  type DiaryProviderState,
} from '@/features/diary/merge';
import { useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { anilistDeps, anilistQueryKeys } from './anilist';
import {
  letterboxdDeps,
  letterboxdQueryKeys,
  letterboxdReadsAvailable,
} from './letterboxd';
import { traktDeps, traktQueryKeys } from './trakt';

// Trakt/AniList paginate at 50; history is append-mostly so a generous
// staleTime keeps diary ↔ details navigation off the rate budget, and maxPages
// caps how many pages a remount/invalidation replays — a deep-scrolled AniList
// history would otherwise burn the 30 req/min budget in one refetch
// (plan 0016 KTD9, docs/solutions/anilist-rate-limit-retry-storm.md).
const PAGE_SIZE = 50;
const MAX_PAGES = 5;
const DIARY_STALE_MS = 5 * 60_000;

/** A short final page signals end-of-history; a full page has a successor. */
function pageAfter(lastPage: NormalizedDiaryEntry[], lastPageParam: number) {
  return lastPage.length < PAGE_SIZE ? undefined : lastPageParam + 1;
}

/** `getPreviousPageParam` so `maxPages` windowing can still scroll back up. */
function pageBefore(_first: NormalizedDiaryEntry[], firstPageParam: number) {
  return firstPageParam > 1 ? firstPageParam - 1 : undefined;
}

/**
 * The AniList list-activity page fetcher resolves (and caches forever) the
 * viewer id first, exactly like `fetchCurrentAnime` — steady-state paging spends
 * one request, not two, of the 30 req/min budget.
 */
async function fetchAniListActivityPage(
  queryClient: QueryClient,
  page: number,
): Promise<NormalizedDiaryEntry[]> {
  const deps = anilistDeps();
  const viewerId = await queryClient.fetchQuery({
    queryKey: anilistQueryKeys.viewer(),
    queryFn: () => Effect.runPromise(getViewerId(deps)),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
  return Effect.runPromise(
    getListActivity(deps, { viewerId, page, perPage: PAGE_SIZE }),
  );
}

/**
 * The unified diary feed (plan 0016 U4): one infinite cursor per connected,
 * platform-capable provider, merged behind a watermark into one gapless,
 * grouped, reverse-chronological stream. The three provider hooks are called
 * unconditionally (fixed hook count) and gated via `enabled`; the merge is
 * provider-count-agnostic, so a subset degrades cleanly. No Effect type escapes
 * — the effects run inside each `queryFn` (containment rule).
 */
export function useDiaryFeedQuery(): DiaryFeedResult {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();
  // Device-local zone drives day grouping + headers (plan 0016 R4).
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const readable = providersForFeed(connected);
  const traktEnabled = readable.includes('trakt');
  const anilistEnabled = readable.includes('anilist');
  // Letterboxd reads are native-only (no CORS on web) and need a stored
  // username. The platform gate also keeps this MMKV read out of web SSR.
  const letterboxdUsername =
    readable.includes('letterboxd') && letterboxdReadsAvailable()
      ? (getLetterboxdUsername() ?? '')
      : '';
  const letterboxdEnabled = letterboxdUsername !== '';

  const trakt = useInfiniteQuery({
    queryKey: traktQueryKeys.history(),
    queryFn: ({ pageParam }) =>
      Effect.runPromise(getHistory(traktDeps(), { page: pageParam })),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _all, lastPageParam) =>
      pageAfter(lastPage, lastPageParam),
    getPreviousPageParam: (firstPage, _all, firstPageParam) =>
      pageBefore(firstPage, firstPageParam),
    maxPages: MAX_PAGES,
    staleTime: DIARY_STALE_MS,
    enabled: traktEnabled,
  });

  const anilist = useInfiniteQuery({
    queryKey: anilistQueryKeys.listActivity(),
    queryFn: ({ pageParam }) => fetchAniListActivityPage(queryClient, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _all, lastPageParam) =>
      pageAfter(lastPage, lastPageParam),
    getPreviousPageParam: (firstPage, _all, firstPageParam) =>
      pageBefore(firstPage, firstPageParam),
    maxPages: MAX_PAGES,
    staleTime: DIARY_STALE_MS,
    enabled: anilistEnabled,
  });

  const letterboxd = useInfiniteQuery({
    queryKey: letterboxdQueryKeys.diary(letterboxdUsername),
    queryFn: ({ pageParam }) =>
      Effect.runPromise(getDiary(letterboxdDeps(), { page: pageParam })),
    initialPageParam: 1,
    // RSS is a single recent window — deeper HTML pages are Cloudflare-walled
    // (docs/solutions/letterboxd-diary-html-cloudflare-walled.md), so the diary
    // exhausts after page 1 and drops out of the watermark early.
    getNextPageParam: () => undefined,
    staleTime: DIARY_STALE_MS,
    enabled: letterboxdEnabled,
  });

  const wired: Array<{ provider: ProviderId; query: InfiniteDiaryQuery; enabled: boolean }> = [
    { provider: 'trakt', query: trakt, enabled: traktEnabled },
    { provider: 'anilist', query: anilist, enabled: anilistEnabled },
    { provider: 'letterboxd', query: letterboxd, enabled: letterboxdEnabled },
  ];
  const active = wired.filter((w) => w.enabled);

  const states: DiaryProviderState[] = active.map(({ provider, query }) => ({
    provider,
    entries: (query.data?.pages ?? []).flat(),
    // A provider whose read errored drops out of the watermark so it never
    // holds back the providers that did load (partial-failure contract).
    hasMore: query.status === 'error' ? false : (query.hasNextPage ?? false),
    failed: query.status === 'error',
  }));

  const merged = mergeDiaryEntries(states);
  const days = groupDiaryEntries(merged, timeZone);

  // The R10 banner re-evaluates on every initial OR pagination failure — a
  // populated `error` covers both (unlike `status`, which stays 'success' once
  // any page has loaded).
  const errors = active
    .map(({ provider, query }) => ({ provider, error: query.error }))
    .filter(
      (entry): entry is { provider: ProviderId; error: Error } =>
        entry.error != null,
    );

  const advance = watermarkProviders(states);
  function fetchNextPage() {
    for (const { provider, query } of active) {
      if (advance.includes(provider)) query.fetchNextPage();
    }
  }

  function refetch() {
    // allSettled, not all: one provider failing to refresh must not hide the
    // others' outcome (partial-failure contract, AGENTS.md).
    return allSettled(
      Object.fromEntries(
        active.map(({ provider, query }): [string, () => Promise<unknown>] => [
          provider,
          () => query.refetch(),
        ]),
      ),
    );
  }

  return {
    days,
    timeZone,
    activeProviders: active.map((w) => w.provider),
    entryCount: merged.length,
    isLoading: active.some(({ query }) => query.isLoading),
    allFailed: active.length > 0 && states.every((s) => s.failed),
    errors,
    hasNextPage: states.some((s) => s.hasMore),
    isFetchingNextPage: active.some(({ query }) => query.isFetchingNextPage),
    fetchNextPage,
    refetch,
  };
}

type InfiniteDiaryQuery = UseInfiniteQueryResult<
  InfiniteData<NormalizedDiaryEntry[]>,
  Error
>;

export interface DiaryFeedResult {
  days: DiaryDay[];
  /** Device-local IANA zone — grouping + header formatting share it. */
  timeZone: string;
  /** Connected + platform-capable providers (drives the R9 empty states). */
  activeProviders: ProviderId[];
  /** Total merged rows currently exposed (0 → "no logs yet" vs a load state). */
  entryCount: number;
  /** Any active provider still on its initial load. */
  isLoading: boolean;
  /** Every active provider errored (R9 load-failure state / AE5). */
  allFailed: boolean;
  /** Providers whose initial or pagination read failed (R10 banner). */
  errors: Array<{ provider: ProviderId; error: Error }>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /** Advances only the watermark provider(s), never every cursor at once. */
  fetchNextPage: () => void;
  refetch: () => Promise<unknown>;
}
