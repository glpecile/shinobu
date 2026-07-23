import {
  useIsFetching,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { Effect } from 'effect';

import { computeUpNext, selectUpNextPool } from '@/features/up-next/compute';
import type {
  AniListUpNextInput,
  TraktUpNextInput,
  UpNextData,
  UpNextInputs,
} from '@/features/up-next/types';
import { providersForFeed } from '@/lib/providers/routing';
import type { ProviderId } from '@/lib/providers/types';
import {
  getShowWatchedProgress,
  getWatchedShows,
} from '@/lib/providers/trakt/reads';
import { useConnectedProviders } from '@/state/session';

import { fetchCurrentAnimeEntries } from './anilist';
import { cachedAniZipIds } from './mapping';
import { traktDeps, traktQueryKeys } from './trakt';

/**
 * The Up Next feed slot (plan 0019 U4): gathers the raw per-provider inputs
 * both home sections are computed from. Deliberately *raw* — `computeUpNext`
 * runs in the hook at render time, never in the `queryFn`, so `now` is never
 * frozen at fetch time and an episode airing while the app is open moves
 * sections on the next render (KTD-5).
 *
 * Effect stays inside the queryFn (the AGENTS.md containment boundary): no
 * `Effect<…>` appears in any hook signature here.
 */

export const upNextQueryKeys = {
  all: ['up-next'] as const,
  /** The gathered provider inputs — what `invalidateAfterLog` refreshes. */
  inputs: () => [...upNextQueryKeys.all, 'inputs'] as const,
};

/**
 * Per-show progress moves only when the user logs something, and a log already
 * invalidates `showProgress(id)` explicitly — so between logs these reads ride
 * the cache instead of re-spending the pooled request budget on every home
 * mount (same reasoning as the feed's `CATALOGUE_STALE_MS`).
 */
const SHOW_PROGRESS_STALE_MS = 15 * 60_000;

/**
 * The watched-shows list is also the "Your Shows" feed slot; this window keeps
 * the pool selection off the wire when that row just loaded it.
 */
const WATCHED_SHOWS_STALE_MS = 60_000;

/**
 * How many pooled progress requests are in flight at once. Bounded because the
 * pool is a fan of authed calls, not because any single one is slow — a burst
 * of 20 is exactly the shape rate limiters punish.
 */
const PROGRESS_CONCURRENCY = 4;

/** ani.zip lookups are cached forever, so this only bounds the cold burst. */
const MAPPING_CONCURRENCY = 4;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Trakt half: pool first (KTD-2), then one `next_episode`-bearing progress call
 * per pooled show. A single show's failure omits that show — never the section.
 */
async function traktInputs(queryClient: QueryClient): Promise<TraktUpNextInput[]> {
  const shows = await queryClient.fetchQuery({
    queryKey: traktQueryKeys.watchedShows(),
    queryFn: () => Effect.runPromise(getWatchedShows(traktDeps())),
    staleTime: WATCHED_SHOWS_STALE_MS,
  });

  const pool = selectUpNextPool(shows);
  const results = await Effect.runPromise(
    Effect.forEach(
      pool,
      (item) =>
        Effect.promise(async (): Promise<TraktUpNextInput | null> => {
          const traktId = item.externalIds.trakt;
          if (traktId == null) return null;
          try {
            const progress = await queryClient.fetchQuery({
              queryKey: traktQueryKeys.showProgress(traktId),
              queryFn: () =>
                Effect.runPromise(
                  getShowWatchedProgress(traktDeps(), { traktId }),
                ),
              staleTime: SHOW_PROGRESS_STALE_MS,
            });
            return {
              item,
              ...(progress.nextEpisode != null
                ? { nextEpisode: progress.nextEpisode }
                : {}),
            };
          } catch {
            return null;
          }
        }),
      { concurrency: PROGRESS_CONCURRENCY },
    ),
  );

  return results.filter((input): input is TraktUpNextInput => input != null);
}

/**
 * AniList half: one widened list request (U2), plus — only when Trakt is also
 * connected, since dedupe is the sole consumer — a bounded ani.zip lookup per
 * pool anime to learn its TMDB id (R5). Every lookup is forever-cached and
 * degrades to "no id", which just leaves a duplicate card standing.
 */
async function anilistInputs(
  queryClient: QueryClient,
  needsTmdbIds: boolean,
): Promise<AniListUpNextInput[]> {
  const entries = await fetchCurrentAnimeEntries(queryClient);
  if (!needsTmdbIds) return entries;

  return Effect.runPromise(
    Effect.forEach(
      entries,
      (entry) =>
        Effect.promise(async (): Promise<AniListUpNextInput> => {
          const known = entry.item.externalIds.tmdb;
          if (known != null) return { ...entry, tmdbId: known };
          const anilistId = entry.item.externalIds.anilist;
          if (anilistId == null) return entry;
          const mapped = await cachedAniZipIds(queryClient, { anilistId });
          return mapped?.tmdb != null ? { ...entry, tmdbId: mapped.tmdb } : entry;
        }),
      { concurrency: MAPPING_CONCURRENCY },
    ),
  );
}

/**
 * Both providers in parallel, each failing independently: a disconnected or
 * broken provider contributes an error entry and zero inputs, and the other
 * one's entries still render (R4 — the unified-feed partial-failure contract,
 * not a thrown slot).
 */
export async function fetchUpNextInputs(
  queryClient: QueryClient,
  connected: readonly ProviderId[],
): Promise<UpNextInputs> {
  const feedProviders = providersForFeed(connected);
  const wantsTrakt = feedProviders.includes('trakt');
  const wantsAniList = feedProviders.includes('anilist');

  const [trakt, anilist] = await Promise.all([
    wantsTrakt
      ? settle('trakt', () => traktInputs(queryClient))
      : none<TraktUpNextInput>(),
    wantsAniList
      ? settle('anilist', () => anilistInputs(queryClient, wantsTrakt))
      : none<AniListUpNextInput>(),
  ]);

  return {
    trakt: trakt.inputs,
    anilist: anilist.inputs,
    errors: [...trakt.errors, ...anilist.errors],
  };
}

interface ProviderContribution<Input> {
  inputs: Input[];
  errors: UpNextInputs['errors'];
}

/** A disconnected provider contributes nothing — and that is not an error. */
function none<Input>(): ProviderContribution<Input> {
  return { inputs: [], errors: [] };
}

/** One provider's contribution, with its failure captured instead of thrown. */
async function settle<Input>(
  provider: ProviderId,
  run: () => Promise<Input[]>,
): Promise<ProviderContribution<Input>> {
  try {
    return { inputs: await run(), errors: [] };
  } catch (error: unknown) {
    return { inputs: [], errors: [{ provider, message: errorMessage(error) }] };
  }
}

function upNextOptions(
  queryClient: QueryClient,
  connected: readonly ProviderId[],
) {
  return {
    queryKey: upNextQueryKeys.inputs(),
    queryFn: () => fetchUpNextInputs(queryClient, connected),
  };
}

export interface UpNextResult extends UpNextData {
  /** Providers whose inputs failed — the sections degrade, never blank (R4). */
  errors: UpNextInputs['errors'];
  /**
   * The clock this render's split was computed against — passed down so cards
   * label their badges from the same instant the sections were built from.
   */
  now: Date;
}

/**
 * Both Up Next sections, recomputed from cached inputs on every render.
 * Suspense variant — mount it under a `SuspenseSection` like every other feed
 * row (AGENTS.md "Loading & Error States").
 */
export function useSuspenseUpNextQuery(): UpNextResult {
  const queryClient = useQueryClient();
  const connected = useConnectedProviders();
  const { data } = useSuspenseQuery(upNextOptions(queryClient, connected));
  const now = new Date();
  return { ...computeUpNext(data, now), errors: data.errors, now };
}

/**
 * Whether the slot is currently refetching — the settle signal a quick-log
 * card waits on before advancing (KTD-6). `invalidateAfterLog` stays
 * fire-and-forget; this is how the card notices the refetch it triggered.
 */
export function useUpNextSettling(): boolean {
  return useIsFetching({ queryKey: upNextQueryKeys.inputs() }) > 0;
}
