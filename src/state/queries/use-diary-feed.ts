import {
  useInfiniteQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { Effect } from 'effect';

import { getListActivity, getViewer } from '@/lib/providers/anilist/reads';
import { getDiary } from '@/lib/providers/letterboxd/diary';
import {
  getSerializdDiary,
  serializdNextPage,
} from '@/lib/providers/serializd/diary';
import { providersForFeed } from '@/lib/providers/routing';
import { getSimklDiary } from '@/lib/providers/simkl/diary';
import { getHistory } from '@/lib/providers/trakt/reads';
import type { ProviderId } from '@/lib/providers/types';
import type { DiaryDay, NormalizedDiaryEntry } from '@/types/media';
import { groupDiaryEntries, mergeDiaryEntries } from '@/features/diary/merge';
import { useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { getSerializdUsername } from '@/state/session/serializd';
import { anilistDeps, anilistQueryKeys } from './anilist';
import {
  diaryQueryKeys,
  diaryStates,
  nextDiaryCursor,
  type DiaryCursor,
  type DiaryPage,
  type DiarySlice,
} from './diary-pages';
import { letterboxdDeps } from './letterboxd';
import { serializdDeps } from './serializd';
import type { ProviderFailure } from './settle';
import { simklDeps } from './simkl';
import { traktDeps } from './trakt';

// Trakt/AniList paginate at 50; history is append-mostly so a generous
// staleTime keeps diary ↔ details navigation off the rate budget
// (plan 0016 KTD9, docs/solutions/anilist-rate-limit-retry-storm.md).
// No `maxPages`: page 1 holds Simkl's and Letterboxd's *entire* windows, so
// windowing would drop them wholesale after a deep scroll.
const PAGE_SIZE = 50;
const DIARY_STALE_MS = 5 * 60_000;

/** A short final page signals end-of-history; a full page has a successor. */
function pageAfter(entries: NormalizedDiaryEntry[], page: number) {
  return entries.length < PAGE_SIZE ? undefined : page + 1;
}

/**
 * The AniList list-activity page fetcher resolves (and caches forever) the
 * viewer id first, exactly like `fetchCurrentAnimeEntries` — steady-state paging spends
 * one request, not two, of the 30 req/min budget.
 */
async function fetchAniListActivityPage(
  queryClient: QueryClient,
  page: number,
): Promise<NormalizedDiaryEntry[]> {
  const deps = anilistDeps();
  const viewer = await queryClient.fetchQuery({
    queryKey: anilistQueryKeys.viewer(),
    queryFn: () => Effect.runPromise(getViewer(deps)),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
  return Effect.runPromise(
    getListActivity(deps, { viewerId: viewer.id, page, perPage: PAGE_SIZE }),
  );
}

type FetchSlice = (
  queryClient: QueryClient,
  page: number,
) => Promise<Pick<DiarySlice, 'entries' | 'next'>>;

/** One page of each provider's diary; the effects run here (containment rule). */
const FETCH_SLICE: Record<ProviderId, FetchSlice> = {
  trakt: async (_queryClient, page) => {
    const entries = await Effect.runPromise(getHistory(traktDeps(), { page }));
    return { entries, next: pageAfter(entries, page) };
  },
  anilist: async (queryClient, page) => {
    const entries = await fetchAniListActivityPage(queryClient, page);
    return { entries, next: pageAfter(entries, page) };
  },
  // RSS is a single recent window — deeper HTML pages are Cloudflare-walled
  // (docs/solutions/letterboxd-diary-html-cloudflare-walled.md), so the diary
  // exhausts after page 1 and drops out of the watermark early. On web it
  // reads through the Worker proxy (plan 0018); native reads letterboxd.com.
  letterboxd: async () => ({
    entries: await Effect.runPromise(getDiary(letterboxdDeps(), { page: 1 })),
    next: undefined,
  }),
  // A real paginated read: the page carries `{ entries, totalPages }`.
  // Watermark ordering keys on `dateAdded` (KTD8), already `watchedAt`.
  serializd: async (_queryClient, page) => {
    const result = await Effect.runPromise(
      getSerializdDiary(serializdDeps(), { page }),
    );
    return { entries: result.entries, next: serializdNextPage(result, page) };
  },
  // Simkl has no history endpoint — the diary is a projection of the one
  // `/sync/all-items` snapshot (per-episode watched instants), so like
  // Letterboxd it is a single window (rate-limit discipline:
  // docs/solutions/simkl-rate-limits-and-write-lock.md).
  simkl: async () => ({
    entries: await Effect.runPromise(getSimklDiary(simklDeps())),
    next: undefined,
  }),
};

/**
 * One diary page: the cursor's providers fetched in parallel, each failure
 * settled into its slice rather than thrown (partial-failure contract — one
 * provider down never blanks the others, and the banner names it). A failed
 * slice keeps its page so the next advance retries it. No automatic retry
 * here: the banner's Retry and pull-to-refresh replay the query.
 */
async function fetchDiaryPage(
  queryClient: QueryClient,
  cursor: DiaryCursor,
): Promise<DiaryPage> {
  const slices = await Promise.all(
    (Object.entries(cursor) as Array<[ProviderId, number]>).map(
      async ([provider, page]): Promise<[ProviderId, DiarySlice]> => {
        try {
          return [provider, await FETCH_SLICE[provider](queryClient, page)];
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          return [provider, { entries: [], next: page, error: message }];
        }
      },
    ),
  );
  return { slices: Object.fromEntries(slices) };
}

/**
 * The unified diary feed (plan 0016 U4): one infinite query over every
 * connected, platform-capable provider, merged behind a watermark into one
 * gapless, grouped, reverse-chronological stream. Each page advances only the
 * watermark provider(s) (`nextDiaryCursor`); the merge is provider-count-
 * agnostic, so a subset degrades cleanly. No Effect type escapes — the effects
 * run inside the `queryFn` (containment rule).
 */
export function useDiaryFeedQuery(): DiaryFeedResult {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();
  // Device-local zone drives day grouping + headers (plan 0016 R4).
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const readable = providersForFeed(connected);
  // Letterboxd and Serializd reads need a stored username. The `readable`
  // gate keeps these MMKV reads out of web SSR renders (`readable` is empty
  // in the server snapshot — plan 0016 R16).
  const letterboxdUsername = readable.includes('letterboxd')
    ? (getLetterboxdUsername() ?? '')
    : '';
  const serializdUsername = readable.includes('serializd')
    ? (getSerializdUsername() ?? '')
    : '';
  const usernames: Partial<Record<ProviderId, string>> = {
    letterboxd: letterboxdUsername,
    serializd: serializdUsername,
  };
  const active = readable.filter((provider) => usernames[provider] !== '');

  const query = useInfiniteQuery({
    queryKey: diaryQueryKeys.feed(active, letterboxdUsername, serializdUsername),
    queryFn: ({ pageParam }) => fetchDiaryPage(queryClient, pageParam),
    initialPageParam: Object.fromEntries(
      active.map((provider) => [provider, 1]),
    ) as DiaryCursor,
    getNextPageParam: (_last, pages) => nextDiaryCursor(pages),
    staleTime: DIARY_STALE_MS,
    enabled: active.length > 0,
  });

  const states = diaryStates(query.data?.pages ?? []);
  const merged = mergeDiaryEntries(states);

  return {
    days: groupDiaryEntries(merged, timeZone),
    timeZone,
    activeProviders: active,
    entryCount: merged.length,
    isLoading: query.isLoading,
    allFailed: active.length > 0 && states.every((state) => state.failed),
    // A provider's initial *or* pagination failure — its latest slice's error.
    errors: states.flatMap((state) =>
      state.error == null ? [] : [{ provider: state.provider, message: state.error }],
    ),
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    refetch: () => query.refetch(),
  };
}

export interface DiaryFeedResult {
  days: DiaryDay[];
  /** Device-local IANA zone — grouping + header formatting share it. */
  timeZone: string;
  /** Connected + platform-capable providers (drives the R9 empty states). */
  activeProviders: ProviderId[];
  /** Total merged rows currently exposed (0 → "no logs yet" vs a load state). */
  entryCount: number;
  /** The first page — every provider — is still in flight. */
  isLoading: boolean;
  /** Every active provider errored (R9 load-failure state / AE5). */
  allFailed: boolean;
  /** Providers whose initial or pagination read failed (R10 banner). */
  errors: ProviderFailure[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /** Advances only the watermark provider(s), never every cursor at once. */
  fetchNextPage: () => void;
  refetch: () => Promise<unknown>;
}
