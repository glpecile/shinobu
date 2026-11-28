import {
  onlineManager,
  useMutation,
  useQueryClient,
  type InvalidateQueryFilters,
  type QueryClient,
} from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import { logToAniList } from '@/lib/providers/anilist/writes';
import { logToLetterboxd } from '@/lib/providers/letterboxd/writes';
import { hasLetterboxdUserscript } from '@/lib/providers/letterboxd/userscript-bridge';
import { logToSerializd } from '@/lib/providers/serializd/writes';
import { HardcoverStatus } from '@/lib/providers/hardcover/reads';
import { logToHardcover } from '@/lib/providers/hardcover/writes';
import { logToSimkl, simklEntryDropReason, type SimklLogEntry } from '@/lib/providers/simkl/writes';
import { diaryHasEpisode, getSerializdDiary } from '@/lib/providers/serializd/diary';
import { getWatchedEpisodeKeys, serializdHasEpisodes } from '@/lib/providers/serializd/progress';
import { recordRecentTags } from '@/state/prefs/recent-tags';
import { DIARY_QUERY_ROOT, cachedDiaryEntries } from '@/state/queries/diary-pages';
import {
  letterboxdDeps,
  letterboxdFilmWatchQuery,
  letterboxdQueryKeys,
} from '@/state/queries/letterboxd';
import { serializdDeps, serializdQueryKeys } from '@/state/queries/serializd';
import {
  hardcoverBookEntryQuery,
  hardcoverDeps,
  hardcoverQueryKeys,
} from '@/state/queries/hardcover';
import { simklDeps, simklQueryKeys } from '@/state/queries/simkl';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { getSerializdUsername } from '@/state/session/serializd';
import {
  continuePrequelTable,
  entryNumberFor,
  translateEntryEpisodes,
} from '@/lib/providers/mapping/episode-translation';
import {
  cachedAniListPrequel,
  cachedAniListLaterCours,
  cachedAniZipEpisodeMap,
  cachedAniZipIds,
  cachedSeasonLayout,
  cachedTmdbTvIdByTvdb,
} from '@/state/queries/mapping';
import { PROVIDERS } from '@/lib/providers/registry';
import {
  anilistMediaKind,
  canQueueLog,
  isManualWriteTarget,
  logReadProvesAbsence,
  resolveWriteTargets,
} from '@/lib/providers/routing';
import { getShowWatchedProgress, getWatchedMovies } from '@/lib/providers/trakt/reads';
import type { TraktShowProgressResult } from '@/lib/providers/trakt/normalize';
import { logToTrakt } from '@/lib/providers/trakt/writes';
import type { AniZipEpisodeMap } from '@/lib/providers/mapping/anizip';
import { Provider, type ProviderId } from '@/lib/providers/types';
import { anilistDeps, anilistQueryKeys } from '@/state/queries/anilist';
import { getEntryState } from '@/lib/providers/anilist/reads';
import { traktDeps, traktQueryKeys } from '@/state/queries/trakt';
import { upNextQueryKeys } from '@/state/queries/up-next';
import { watchlistQueryKeys } from '@/state/queries/watchlist';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';
import { enrichExternalIds } from './enrich';
import { removeWatchedFromWatchlist } from './remove-watched-from-watchlist';
import { currentPlatform } from './use-log-targets';
import { createAniListWriteQueue } from './anilist-write-queue';
import { dayKeyForInstant } from '@/features/diary/merge';
import { createSimklLogQueue } from './simkl-write-lock';
import {
  MAX_PENDING_LOGS,
  beginReplay,
  queuePendingLog,
  settleReplay,
  takePendingLegs,
} from './pending-logs';
import {
  anilistHasEpisodes,
  anilistHasFilm,
  reconcileLogTargets,
  traktHasEpisodes,
  traktHasFilm,
  type LogDecision,
  type ProviderWatchRecord,
} from './reconcile';
import {
  fanOutLog,
  transientKind,
  type WriteAdapter,
  type LogMediaResult,
  type LogMediaVariables,
  type ProviderWriteResult,
  type ProviderWriteOutcome,
} from './fan-out';

/** Serialize AniList writes to keep two logs from regressing the same progress counter. */
const anilistWriteQueue = createAniListWriteQueue();

function anilistProgress({
  episode,
  episodes,
  entryEpisodes,
}: Pick<LogMediaVariables, 'episode' | 'episodes' | 'entryEpisodes'>): number | null {
  if (entryEpisodes != null && entryEpisodes.length > 0) {
    return Math.max(...entryEpisodes);
  }
  if (episode != null) return episode.number;
  if (episodes != null && episodes.length > 0) {
    return Math.max(...episodes.map((e) => e.number));
  }
  return null;
}

/** Run Effects at the write boundary. Simkl's adapter also needs the episode mapping cache. */
const LOG_ADAPTERS: Partial<Record<ProviderId, WriteAdapter<LogMediaVariables>>> = {
  // Resolves a ProviderWriteResult itself: a rewatch play Trakt's own
  // "Disable Multiple Plays" setting declines comes back as a reasoned skip.
  trakt: ({ item, episode, episodes, watchedAt }) =>
    Effect.runPromise(
      logToTrakt(traktDeps(), item, {
        ...(episode != null ? { episode } : {}),
        ...(episodes != null ? { episodes } : {}),
        ...(watchedAt != null ? { watchedAt } : {}),
      }),
    ),
  // AniList writes entry-relative episodes. Canonical tracker seasons can put a cour's episode
  // on the wrong entry.
  anilist: ({ item, episode, episodes, entryEpisodes, rewatch, reading }) => {
    // A bridged Hardcover book writes its volume, never its page (plan 0117 B5).
    if (item.type === 'BOOK') {
      const volume = item.anilistVolume;
      return volume == null || reading == null
        ? Promise.resolve({ status: 'skipped', reason: 'needs the book’s AniList volume' })
        : anilistWriteQueue.submit(null, 0, () =>
            Effect.runPromise(
              logToAniList(anilistDeps(), item, {
                volume: { number: volume, finished: reading.finished },
                ...(rewatch === true ? { rewatch: true } : {}),
              }),
            ).then(okResult),
          );
    }
    const progress = anilistProgress({ episode, episodes, entryEpisodes });
    const mediaId = item.externalIds.anilist;
    return anilistWriteQueue.submit(
      // Foldable only where the write is a progress counter: a film's rewatch
      // *increments* `repeat`, so two of those are two facts.
      progress != null && mediaId != null ? `${mediaId}:${rewatch === true}` : null,
      progress ?? 0,
      () =>
        Effect.runPromise(
          logToAniList(anilistDeps(), item, {
            ...(progress != null ? { progress } : {}),
            ...(rewatch === true ? { rewatch: true } : {}),
          }),
        ).then(okResult),
    );
  },
  // Use the signed-in WebView or userscript for Letterboxd diary writes. The public relay only
  // permits GET.
  letterboxd: ({ item, watchedAt, tags, rewatch, liked }) =>
    Effect.runPromise(
      logToLetterboxd(letterboxdDeps(), item, {
        liked,
        ...(watchedAt != null ? { watchedAt } : {}),
        ...(tags != null && tags.length > 0 ? { tags } : {}),
        ...(rewatch === true ? { rewatch: true } : {}),
      }),
    ).then(okResult),
  // A book's day is the reader's calendar day, so it is taken in the device
  // time zone. `watchedAt` is present only on a backdated log.
  hardcover: ({ item, reading, watchedAt, rewatch }) =>
    reading == null
      ? Promise.resolve({ status: 'skipped', reason: 'needs a page or a finished book to log' })
      : Effect.runPromise(
          logToHardcover(hardcoverDeps(), item, {
            reading,
            date: dayKeyForInstant(
              watchedAt != null ? new Date(watchedAt) : new Date(),
              Intl.DateTimeFormat().resolvedOptions().timeZone,
            ),
            ...(watchedAt != null ? { at: watchedAt } : {}),
            ...(rewatch === true ? { reread: true } : {}),
          }),
        ),
  // Serializd reports unmappable items as skips so the write report can offer their manual
  // links.
  serializd: ({ item, episode, episodes, watchedAt, tags, rewatch, liked }) =>
    Effect.runPromise(
      logToSerializd(serializdDeps(), item, {
        liked,
        ...(episode != null ? { episode } : {}),
        ...(episodes != null ? { episodes } : {}),
        ...(watchedAt != null ? { watchedAt } : {}),
        ...(tags != null && tags.length > 0 ? { tags } : {}),
        ...(rewatch === true ? { rewatch: true } : {}),
      }),
    ),
};

function okResult(): ProviderWriteResult {
  return { status: 'ok' };
}

/**
 * A canonical batch needs the cached reverse mapping before Simkl can write AniDB episode
 * numbers.
 */
export function simklLogAdapter(
  queryClient: QueryClient,
  log: (entry: SimklLogEntry) => Promise<ProviderWriteResult> = simklLogQueue.log,
): WriteAdapter<LogMediaVariables> {
  return async ({ item, episode, episodes, entryEpisodes, watchedAt }) => {
    const needsMap =
      item.type === 'ANIME' &&
      item.isFilm !== true &&
      (entryEpisodes == null || entryEpisodes.length === 0) &&
      (episodes != null || episode != null);
    const anilistId = item.externalIds.anilist;
    const episodeMap =
      needsMap && anilistId != null
        ? await cachedAniZipEpisodeMap(queryClient, anilistId).catch(() => null)
        : null;
    const entry: SimklLogEntry = {
      item,
      ...(episode != null ? { episode } : {}),
      ...(episodes != null ? { episodes } : {}),
      ...(entryEpisodes != null ? { entryEpisodes } : {}),
      ...(watchedAt != null ? { watchedAt } : {}),
      episodeMap,
    };
    const dropReason = simklEntryDropReason(entry);
    // An unbuildable entry would be dropped inside a coalesced POST and inherit
    // the other entries' ok; alone it is a reasoned skip with the manual link.
    if (dropReason != null) return { status: 'skipped', reason: dropReason };
    return log(entry);
  };
}

/**
 * The one gate every Simkl history write passes through (see
 * `simkl-write-lock.ts`). Module-level on purpose: the lock is per user
 * account, not per sheet or per mutation.
 */
const simklLogQueue = createSimklLogQueue((entries) =>
  Effect.runPromise(logToSimkl(simklDeps(), entries)),
);

export function logAdapters(
  queryClient: QueryClient,
): Partial<Record<ProviderId, WriteAdapter<LogMediaVariables>>> {
  return { ...LOG_ADAPTERS, simkl: simklLogAdapter(queryClient) };
}

type LogAdapters = Partial<Record<ProviderId, WriteAdapter<LogMediaVariables>>>;

function replaceAdapters<T>(
  adapters: LogAdapters,
  entries: Iterable<readonly [ProviderId, T]>,
  adapterFor: (value: T) => WriteAdapter<LogMediaVariables>,
): LogAdapters {
  return {
    ...adapters,
    ...Object.fromEntries(
      Array.from(entries, ([provider, value]) => [provider, adapterFor(value)]),
    ),
  };
}

/**
 * Turn each mapping-blocked provider's adapter into a no-op that resolves its
 * reason (plan 0027 R3/KTD3). Deliberately *not* a new `ProviderWriteOutcome`
 * status or a pre-fan-out filter: routing it through the ordinary adapter path
 * means `fanOutLog`, the outcome merge, and plan 0022's manual-link affordance
 * all treat it exactly like Serializd's own unresolvable-season skip.
 */
export function withMappingSkips(
  adapters: LogAdapters,
  mappingSkips: ReadonlyMap<ProviderId, string>,
): LogAdapters {
  return replaceAdapters(
    adapters,
    mappingSkips,
    (reason) => () => Promise.resolve({ status: 'skipped', reason }),
  );
}

/**
 * Fails, without writing, each retried target that couldn't say whether its
 * failed write landed: resending could log the watch twice. The error keeps
 * it in `failed`, so the report links to the provider and Try again re-reads.
 */
export function withUnconfirmed(
  adapters: LogAdapters,
  unconfirmed: readonly ProviderId[],
): LogAdapters {
  return replaceAdapters(
    adapters,
    unconfirmed.map((provider) => [provider, PROVIDERS[provider].label] as const),
    (label) => () =>
      Promise.reject(
        new Error(`Couldn’t check whether the last try reached ${label}, so it wasn’t sent again.`),
      ),
  );
}

/**
 * Fails, without writing, each replayed target whose watch-state read got no
 * answer. The read's own error is the outcome, so the report says the target
 * could succeed later.
 */
export function withUnread(
  adapters: LogAdapters,
  unread: ReadonlyMap<ProviderId, unknown>,
): LogAdapters {
  return replaceAdapters(adapters, unread, (error) => () => Promise.reject(error));
}

const SERIALIZD_STALE_MS = 5 * 60_000;

/** Simkl handles anime numbering in its adapter, so it stays out of the canonical tracker set. */
const CANONICAL_EPISODE_PROVIDERS: readonly ProviderId[] = [Provider.Trakt, Provider.Serializd];

function intendedEpisodes(
  variables: LogMediaVariables,
): Array<{ season: number; number: number }> | null {
  if (variables.episodes != null && variables.episodes.length > 0) {
    return variables.episodes;
  }
  if (variables.episode != null) return [variables.episode];
  return null;
}

/**
 * Films have neither episode domain. An unmappable anime batch keeps its entry numbers and has
 * no canonical numbers.
 */
interface LogDomains {
  canonical: Array<{ season: number; number: number }> | null;
  entry: number[] | null;
}

interface LogPlan {
  item: NormalizedMediaItem;
  targets: ProviderId[];
  domains: LogDomains;
  mappingSkips: Map<ProviderId, string>;
}

/**
 * The entry's ani.zip table. When ani.zip hasn't mapped the entry yet, a first
 * series counts from S1E1, and a second cour continues its prequel's table
 * over `entryNumbers`.
 */
async function entryEpisodeMap(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
  entryNumbers: readonly number[],
): Promise<AniZipEpisodeMap | null> {
  const anilistId = item.externalIds.anilist;
  if (anilistId == null) return null;
  const own = await cachedAniZipEpisodeMap(queryClient, anilistId);
  if (own != null && own.size > 0) return own;
  const prequel = await cachedAniListPrequel(queryClient, anilistId);
  // A just-premiered show waits days for ani.zip, which lists it with an empty
  // table. With no prequel, entry episode n can only be the show's nth, and
  // `placeInLayout` still checks it. A failed ani.zip read (null) still skips.
  if (prequel === 'none' && own != null) {
    return new Map(entryNumbers.map((n) => [n, { season: 1, number: n, absolute: n }]));
  }
  if (prequel == null || prequel === 'none') return own;
  // AniList also links prequels that trackers keep as separate shows, such as
  // Naruto and Shippuden. A relation cannot vouch for shared numbering.
  const ids = await cachedAniZipIds(queryClient, { anilistId: prequel.id });
  if (ids?.tvdb == null) return own;
  if (item.externalIds.tvdb != null) {
    if (ids.tvdb !== item.externalIds.tvdb) return own;
  } else if (
    item.externalIds.tmdb == null ||
    (await cachedTmdbTvIdByTvdb(queryClient, ids.tvdb)) !== item.externalIds.tmdb
  ) {
    return own;
  }
  const prequelMap = await cachedAniZipEpisodeMap(queryClient, prequel.id);
  return continuePrequelTable(prequelMap, prequel.episodes, entryNumbers) ?? own;
}

// shortcut: search at most eight entries; widen this if a real franchise exceeds the limit.
const MAX_COUR_LOOKUPS = 8;

/**
 * Find the AniList cour that owns a canonical batch. Trackers may file several cours under one
 * show.
 */
async function canonicalCourEntry(
  queryClient: QueryClient,
  anilistId: number,
  episodes: ReadonlyArray<{ season: number; number: number }>,
): Promise<{ anilist: number; mal?: number; entry: number[] } | null> {
  const queue = [anilistId];
  const seen = new Set(queue);
  let tvdb: number | undefined;
  for (let id = queue.shift(); id != null; id = queue.shift()) {
    const ids = await cachedAniZipIds(queryClient, { anilistId: id });
    tvdb ??= ids?.tvdb;
    if (tvdb == null || ids?.tvdb !== tvdb) continue;
    const map = await cachedAniZipEpisodeMap(queryClient, id);
    const entry = map == null ? [] : episodes.map((episode) => entryNumberFor(map, episode));
    if (entry.length > 0 && entry.every((number): number is number => number != null)) {
      return { anilist: id, ...(ids.mal != null ? { mal: ids.mal } : {}), entry };
    }
    for (const next of await cachedAniListLaterCours(queryClient, id)) {
      if (seen.has(next) || seen.size >= MAX_COUR_LOOKUPS) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return null;
}

/**
 * Resolve identity, targets, and both episode numberings before reconciliation. The prefetch
 * follows the same path.
 */
async function resolveLogPlan(
  queryClient: QueryClient,
  variables: LogMediaVariables,
  connected: readonly ProviderId[],
): Promise<LogPlan> {
  let item = await enrichExternalIds(queryClient, variables.item, connected);

  // A one-episode entry the enrichment filed as a film arrives as an episode
  // log; a film has no episodes.
  const film = item.isFilm === true;
  const canonicalInput = film ? null : intendedEpisodes(variables);
  const entryInput =
    !film && variables.entryEpisodes != null && variables.entryEpisodes.length > 0
      ? variables.entryEpisodes
      : null;

  const laterSeason = canonicalInput?.some((episode) => episode.season !== 1) === true;

  // A later season logged from a TMDB/Trakt show logs to that cour's own
  // AniList and Simkl entry, as the cour's AniList page would.
  const cour =
    entryInput == null && item.isFilm !== true && item.externalIds.anilist != null && laterSeason
      ? await canonicalCourEntry(queryClient, item.externalIds.anilist, canonicalInput)
      : null;
  if (cour != null) {
    // The show's Simkl and MAL ids name its first cour.
    const { simkl: _simkl, mal: _mal, ...ids } = item.externalIds;
    item = {
      ...item,
      type: 'ANIME',
      externalIds: {
        ...ids,
        anilist: cour.anilist,
        ...(cour.mal != null ? { mal: cour.mal } : {}),
      },
    };
  }

  const targets = resolveWriteTargets(item, connected, {
    capability: 'log',
    onlyProviders: variables.providers,
    platform: currentPlatform(),
    letterboxdUserscript: hasLetterboxdUserscript(),
  });

  const mappingSkips = new Map<ProviderId, string>();
  // A later canonical season has no place on the show's AniList entry, which
  // is its first cour. With no cour found, the only safe move is not to write.
  if (targets.includes(Provider.AniList) && cour == null && entryInput == null && laterSeason) {
    mappingSkips.set(Provider.AniList, 'Could not find the AniList entry for this season');
  }
  if (
    targets.includes(Provider.Simkl) &&
    entryInput == null &&
    item.externalIds.anilist != null &&
    laterSeason &&
    ((item.type === 'TV' && cour == null) || (cour != null && cour.mal == null))
  ) {
    mappingSkips.set(
      Provider.Simkl,
      'Could not resolve a cour-specific Simkl identity for these episodes',
    );
  }
  if (entryInput == null) {
    return {
      item,
      targets,
      domains: {
        canonical: canonicalInput,
        // A season-one batch can use entry numbers directly. Later seasons need a proven
        // mapping to the cour, even for Simkl.
        entry:
          cour?.entry ??
          (canonicalInput != null && canonicalInput.every((episode) => episode.season === 1)
            ? canonicalInput.map((episode) => episode.number)
            : null),
      },
      mappingSkips,
    };
  }

  const canonicalTargets = targets.filter((provider) =>
    CANONICAL_EPISODE_PROVIDERS.includes(provider),
  );
  // No canonical-numbering target → nothing needs translating, so an
  // AniList-only user never pays for the ~1 MB ani.zip document (R7), and no
  // skip outcome appears for a provider that was never a target.
  if (canonicalTargets.length === 0) {
    return { item, targets, domains: { canonical: null, entry: entryInput }, mappingSkips };
  }

  const anilistId = item.externalIds.anilist;
  // Read ani.zip and the destination layout in parallel. TVDB's season boundaries can differ
  // from the tracker's (docs/solutions/anizip-tvdb-seasons-vs-tracker-seasons.md).
  const [episodeMap, layout] = await Promise.all([
    entryEpisodeMap(queryClient, item, entryInput),
    cachedSeasonLayout(queryClient, {
      ...(item.externalIds.tmdb != null ? { tmdb: item.externalIds.tmdb } : {}),
      ...(item.externalIds.trakt != null ? { trakt: item.externalIds.trakt } : {}),
    }),
  ]);
  const translated =
    anilistId == null
      ? ({ ok: false, reason: 'no AniList id to resolve a canonical season from' } as const)
      : translateEntryEpisodes(episodeMap, entryInput, {
          layout,
          ...(item.totalEpisodes != null ? { declaredEpisodeCount: item.totalEpisodes } : {}),
        });

  if (!translated.ok) {
    for (const provider of canonicalTargets) mappingSkips.set(provider, translated.reason);
  }

  return {
    item,
    targets,
    domains: {
      canonical: translated.ok ? translated.episodes : null,
      entry: entryInput,
    },
    mappingSkips,
  };
}

/**
 * Check whether the provider records this watch. Replays require a fresh read and preserve
 * unknown results.
 */
async function providerHasWatch(
  queryClient: QueryClient,
  provider: ProviderId,
  item: NormalizedMediaItem,
  domains: LogDomains,
  read: 'cached' | 'fresh' | 'strict' = 'cached',
): Promise<boolean | null> {
  const episodes = domains.canonical;
  const fresh = read !== 'cached';
  const freshness = fresh ? { staleTime: 0 } : {};
  try {
    switch (provider) {
      case Provider.Trakt: {
        if (episodes == null) {
          const watched = await queryClient.fetchQuery({
            queryKey: traktQueryKeys.watchedMovies(),
            queryFn: () => Effect.runPromise(getWatchedMovies(traktDeps())),
            ...freshness,
          });
          return traktHasFilm(watched, item);
        }
        const traktId = item.externalIds.trakt;
        // `logToTrakt` can still write by tmdb/tvdb id, so a retry can't rule it out.
        if (traktId == null) return fresh ? null : false;
        const progress = await queryClient.fetchQuery({
          queryKey: traktQueryKeys.showProgress(traktId),
          queryFn: () => Effect.runPromise(getShowWatchedProgress(traktDeps(), { traktId })),
          ...freshness,
        });
        return traktHasEpisodes(progress.watchedKeys, episodes);
      }

      case Provider.AniList: {
        const mediaId = item.externalIds.anilist;
        if (mediaId == null) return false;
        // A repeated volume log changes nothing on AniList: the write keeps
        // the higher volume count, and a reread starts only from a completed
        // entry. Hardcover alone decides a reread.
        if (item.type === 'BOOK') return null;
        const state = await queryClient.fetchQuery({
          queryKey: anilistQueryKeys.entryState(mediaId),
          queryFn: () => Effect.runPromise(getEntryState(anilistDeps(), { mediaId })),
          ...freshness,
        });
        const entryNumbers = domains.entry;
        return entryNumbers == null
          ? anilistHasFilm(state.entry)
          : anilistHasEpisodes(state.entry, entryNumbers);
      }

      case Provider.Serializd: {
        const tmdbId = item.externalIds.tmdb;
        const username = getSerializdUsername();
        if (tmdbId == null || username == null || episodes == null) return false;

        const watchedKeys = await queryClient.fetchQuery({
          queryKey: serializdQueryKeys.progress(username, tmdbId),
          queryFn: () => Effect.runPromise(getWatchedEpisodeKeys(serializdDeps(), { tmdbId })),
          staleTime: fresh ? 0 : SERIALIZD_STALE_MS,
        });
        if (!serializdHasEpisodes(watchedKeys, episodes)) return false;

        // Serializd's single-episode log adds a diary entry in a second request. Episode
        // progress alone cannot prove the diary write landed.
        if (episodes.length === 1) {
          return await serializdDiaryHasEpisode(queryClient, tmdbId, episodes[0]);
        }
        return true;
      }

      case Provider.Letterboxd: {
        const username = getLetterboxdUsername();
        if (username == null || episodes != null) return false;
        // The member film page proves a viewing; null only means "no evidence".
        return (
          (await queryClient.fetchQuery({
            ...letterboxdFilmWatchQuery(username, item),
            ...freshness,
          })) != null
        );
      }

      // Simkl reconcile needs a fresh unfiltered library snapshot and AniDB numbering. Until
      // then, its watch state is unknown.
      case Provider.Simkl:
        return null;
      case Provider.Hardcover: {
        const bookId = item.externalIds.hardcover;
        if (bookId == null) return false;
        const entry = await queryClient.fetchQuery({
          ...hardcoverBookEntryQuery(bookId),
          ...freshness,
        });
        return entry?.statusId === HardcoverStatus.Read;
      }
    }
  } catch (error) {
    if (read === 'strict' && transientKind(error) != null) throw error;
    return fresh ? null : false;
  }
}

/**
 * Check Serializd diary evidence, reusing loaded pages when allowed. A fallback page read must
 * leave the infinite cache intact.
 */
async function serializdDiaryHasEpisode(
  queryClient: QueryClient,
  tmdbId: number,
  episode: { season: number; number: number },
): Promise<boolean> {
  const params = { tmdbId, episodeNumber: episode.number, season: episode.season };
  const cachedEntries = cachedDiaryEntries(queryClient).filter(
    (entry) => entry.provider === Provider.Serializd,
  );
  if (diaryHasEpisode(cachedEntries, params)) return true;

  const page = await Effect.runPromise(getSerializdDiary(serializdDeps(), { page: 1 }));
  return diaryHasEpisode(page.entries, params);
}

export function invalidateAfterLog(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
  succeeded: readonly ProviderId[],
  skipped: readonly ProviderId[] = [],
): Promise<void> {
  const refetches: Promise<void>[] = [];
  const invalidate = (filters: InvalidateQueryFilters) => {
    refetches.push(queryClient.invalidateQueries(filters));
  };
  // Invalidate with the enriched identity so provider reads can also match ids discovered
  // during the write.
  if (succeeded.includes(Provider.Trakt)) {
    const filmLike = item.type === 'MOVIE' || item.isFilm === true;
    invalidate({
      queryKey: filmLike ? traktQueryKeys.watchedMovies() : traktQueryKeys.watchedShows(),
    });
    // Trakt removes the watched show or season from the watchlist after an episode log.
    // Invalidate every watchlist sort.
    invalidate({ queryKey: traktQueryKeys.watchlistRoot() });
    const traktId = item.externalIds.trakt;
    if (!filmLike && traktId != null) {
      invalidate({
        queryKey: traktQueryKeys.showProgress(traktId),
      });
    }
  }
  if (succeeded.includes(Provider.AniList)) {
    if (item.externalIds.anilist != null)
      invalidate({ queryKey: anilistQueryKeys.relations(item.externalIds.anilist) });
    invalidate({ queryKey: anilistQueryKeys.library() });
    invalidate({
      queryKey:
        anilistMediaKind(item) === 'MANGA'
          ? anilistQueryKeys.currentMangaEntries()
          : anilistQueryKeys.currentAnimeEntries(),
    });
    const mediaId = item.externalIds.anilist;
    if (mediaId != null) {
      invalidate({
        queryKey: anilistQueryKeys.entryState(mediaId),
      });
    }
  }
  if (succeeded.includes(Provider.Simkl)) {
    // A history write can move an item between Simkl library buckets. Invalidate every filter
    // and the activities signal that gates refetch.
    invalidate({ queryKey: simklQueryKeys.allItemsRoot() });
    invalidate({ queryKey: simklQueryKeys.activities() });
  }
  if (succeeded.includes(Provider.Hardcover)) {
    invalidate({ queryKey: hardcoverQueryKeys.libraryRoot() });
    const bookId = item.externalIds.hardcover;
    invalidate({
      queryKey: hardcoverQueryKeys.listRoot(),
      predicate: ({ state }) => {
        if (bookId == null) return true;
        const data = state.data as
          | { pages?: { entries?: { item?: NormalizedMediaItem }[] }[] }
          | undefined;
        return (
          !Array.isArray(data?.pages) ||
          data.pages.some(
            (page) =>
              !Array.isArray(page?.entries) ||
              page.entries.some(
                (entry) =>
                  typeof entry?.item?.externalIds?.hardcover !== 'number' ||
                  entry.item.externalIds.hardcover === bookId,
              ),
          )
        );
      },
    });
  }
  if (succeeded.includes(Provider.Serializd)) {
    const username = getSerializdUsername();
    if (username != null) {
      invalidate({ queryKey: serializdQueryKeys.watchedShows(username) });
      // A log resumes a paused or dropped show, which Coming Soon leaves out.
      invalidate({ queryKey: serializdQueryKeys.trackingLists(username) });
      invalidate({ queryKey: serializdQueryKeys.upcoming(username) });
      const tmdbId = item.externalIds.tmdb;
      if (tmdbId != null) {
        invalidate({
          queryKey: serializdQueryKeys.progress(username, tmdbId),
        });
      }
    }
  }
  if (succeeded.includes(Provider.Letterboxd)) {
    // Only this film's watch reads changed; the root holds one HTML-scrape query per film.
    const tmdb = item.externalIds.tmdb ?? null;
    const slug =
      item.externalIds.letterboxd ??
      (tmdb != null
        ? (queryClient.getQueryData<string | null>(letterboxdQueryKeys.slug(tmdb)) ?? null)
        : null);
    invalidate({
      queryKey: letterboxdQueryKeys.filmWatchesRoot(),
      predicate: ({ queryKey }) =>
        (slug != null &&
          (queryKey[3] === slug ||
            (typeof queryKey[4] === 'number' &&
              queryClient.getQueryData(letterboxdQueryKeys.slug(queryKey[4])) === slug))) ||
        (tmdb != null && queryKey[4] === tmdb),
    });
    // A pre-write RSS response must not repopulate the shared input as fresh.
    void queryClient.cancelQueries({ queryKey: DIARY_QUERY_ROOT });
    void queryClient.cancelQueries({ queryKey: letterboxdQueryKeys.diaryRoot() });
    invalidate({ queryKey: letterboxdQueryKeys.diaryRoot(), refetchType: 'none' });
  }
  if (succeeded.length > 0) {
    invalidate({ queryKey: DIARY_QUERY_ROOT });
  }
  // Logs can change membership or status without a separate watchlist write.
  // Refresh the gather only after the provider entries it reads are stale.
  if (
    succeeded.includes(Provider.Trakt) ||
    succeeded.includes(Provider.AniList) ||
    succeeded.includes(Provider.Simkl) ||
    succeeded.includes(Provider.Hardcover)
  ) {
    invalidate({ queryKey: watchlistQueryKeys.inputs() });
  }
  // Invalidate Up Next after its sources. The active gather starts synchronously and would
  // otherwise reuse fresh pre-write data
  // (docs/solutions/invalidate-order-strands-continue-watching.md). Skips also trigger it
  // because the provider can already be ahead of the cached cards.
  const touched = (provider: ProviderId) =>
    succeeded.includes(provider) || skipped.includes(provider);
  if (touched(Provider.Trakt) || touched(Provider.AniList) || touched(Provider.Simkl)) {
    invalidate({ queryKey: upNextQueryKeys.inputs() });
  }
  return Promise.all(refetches).then(() => undefined);
}

/** Warm the mutation's identity and reconciliation reads before confirmation. */
export async function prefetchLogReconcile(
  queryClient: QueryClient,
  connected: readonly ProviderId[],
  variables: LogMediaVariables,
): Promise<void> {
  try {
    const plan = await resolveLogPlan(queryClient, variables, connected);
    await Promise.all(
      plan.targets
        .filter((provider) => !plan.mappingSkips.has(provider))
        .map((provider) => providerHasWatch(queryClient, provider, plan.item, plan.domains)),
    );
  } catch {}
}

/** Resolved routing, numbering, and reconciliation for one log, before any write runs. */
export interface LogWritePlan {
  item: NormalizedMediaItem;
  targets: ProviderId[];
  /** Includes mapping skips so the normal outcome path supplies their manual links. */
  writeTargets: ProviderId[];
  /** Targets reconcile found already in sync (skipped, no reason). */
  skipped: ProviderId[];
  mappingSkips: ReadonlyMap<ProviderId, string>;
  /** Retries with no proof an earlier write missed. */
  unconfirmed: ProviderId[];
  /** Replays waiting on an unanswered read. */
  unread: ReadonlyMap<ProviderId, unknown>;
  variables: LogMediaVariables;
  rewatch: boolean;
}

export async function planLogWrite(
  queryClient: QueryClient,
  variables: LogMediaVariables,
  connected: readonly ProviderId[],
): Promise<LogWritePlan> {
  // Exclude manual-only targets here as well as in the sheet. Callers can pass their own
  // provider list.
  const { item, targets, domains, mappingSkips } = await resolveLogPlan(
    queryClient,
    variables,
    connected,
  );

  // An unmapped canonical season cannot participate in reconcile. Comparing first-season keys
  // can turn a rewatch into a catch-up.
  const reconcileTargets = targets.filter((provider) => !mappingSkips.has(provider));
  const retryOf = variables.retryOf;
  const unread = new Map<ProviderId, unknown>();
  const answers = await Promise.all(
    reconcileTargets.map(async (provider) => ({
      provider,
      hasIt: await providerHasWatch(
        queryClient,
        provider,
        item,
        domains,
        variables.replay != null ? 'strict' : retryOf != null ? 'fresh' : 'cached',
      ).catch((error: unknown) => {
        unread.set(provider, error);
        return null;
      }),
    })),
  );
  // A mapping skip is built from lookups that answer null when they fail.
  // While a read gets no answer they may have failed the same way, so the
  // skipped target waits too.
  const [readError] = unread.values();
  if (unread.size > 0) for (const provider of mappingSkips.keys()) unread.set(provider, readError);
  // A provider that can't report its state (null) is written but has no say
  // in catch-up vs. rewatch, like a mapping-skipped provider above.
  const records: ProviderWatchRecord[] = answers.flatMap(({ provider, hasIt }) =>
    hasIt == null ? [] : [{ provider, hasIt }],
  );
  // A retry keeps its round's rewatch decision, and a first-watch retry skips
  // a target whose failed write landed.
  const decisions: LogDecision[] =
    retryOf == null
      ? reconcileLogTargets(records)
      : records.map(({ provider, hasIt }) => ({
          provider,
          action: retryOf.rewatch ? 'rewatch' : hasIt ? 'skip' : 'log',
        }));
  const skipped = decisions
    .filter((decision) => decision.action === 'skip')
    .map((decision) => decision.provider);
  // Keep mapping-skipped targets in fan-out so the outcome includes the manual link.
  const writeTargets = targets.filter((provider) => !skipped.includes(provider));
  // An unanswered write may have landed. "No watch found" clears it only on a
  // provider whose read proves absence.
  const unconfirmed =
    retryOf?.rewatch === false
      ? answers
          .filter(
            ({ provider, hasIt }) =>
              !unread.has(provider) &&
              retryOf.unsent?.includes(provider) !== true &&
              (hasIt == null ||
                (!hasIt &&
                  retryOf.unanswered?.includes(provider) === true &&
                  !logReadProvesAbsence(provider))),
          )
          .map(({ provider }) => provider)
      : [];
  const rewatch =
    retryOf?.rewatch ??
    (decisions.length > 0 && decisions.every((decision) => decision.action === 'rewatch'));

  // Pass both resolved episode domains. Adapters accept a one-episode batch in place of a
  // separate episode field.
  const {
    episode: _episode,
    episodes: _episodes,
    entryEpisodes: _entryEpisodes,
    retryOf: _retryOf,
    replay: _replay,
    ...rest
  } = variables;

  return {
    item,
    targets,
    writeTargets,
    skipped,
    mappingSkips,
    unconfirmed,
    unread,
    rewatch,
    variables: {
      ...rest,
      item,
      rewatch,
      ...(domains.canonical != null ? { episodes: domains.canonical } : {}),
      ...(domains.entry != null ? { entryEpisodes: domains.entry } : {}),
    },
  };
}

/**
 * Queue eligible targets offline. Replays resolve routing and reconciliation after the
 * connection returns.
 */
function queueOffline(
  variables: LogMediaVariables,
  connected: readonly ProviderId[],
): LogMediaResult {
  const platform = currentPlatform();
  const userscript = hasLetterboxdUserscript();
  const targets = (
    variables.providers ??
    resolveWriteTargets(variables.item, connected, {
      capability: 'log',
      platform,
      letterboxdUserscript: userscript,
    })
  ).filter(
    (provider) =>
      connected.includes(provider) && !isManualWriteTarget(provider, platform, 'log', userscript),
  );
  if (targets.length === 0) {
    throw new Error(`No connected provider can log "${variables.item.title}"`);
  }
  const waiting = targets.filter((provider) => canQueueLog(provider, platform));
  const saved = waiting.length > 0 && queuePendingLog(variables, waiting, 'unsent');
  const queued = saved ? waiting : [];
  const outcomes = targets.map((provider): ProviderWriteOutcome =>
    queued.includes(provider)
      ? { provider, status: 'queued' }
      : {
          provider,
          status: 'error',
          message: waiting.includes(provider)
            ? `${MAX_PENDING_LOGS} logs already wait for a connection.`
            : `You are offline, and ${PROVIDERS[provider].label} logs are not saved for later.`,
        },
  );
  return {
    outcomes,
    succeeded: [],
    failed: targets.filter((provider) => !queued.includes(provider)),
    skipped: [],
    queued,
    unanswered: variables.retryOf?.unanswered,
    rewatch: false,
  };
}

/** Plan a log, write to every eligible provider in parallel, and report one outcome per target. */
export function useLogMedia() {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (intent: LogMediaVariables): Promise<LogMediaResult> => {
      const replay = intent.replay;
      if (replay == null && !onlineManager.isOnline()) return queueOffline(intent, connected);

      // A log made by hand takes over the queued legs of the same watch. One
      // that may have landed makes this a retry, so it is never sent as a rewatch.
      let variables = intent;
      if (replay == null && intent.retryOf == null) {
        const asked = intent.providers ?? connected;
        const maybeLanded = takePendingLegs(intent, asked);
        if (maybeLanded.length > 0) {
          variables = {
            ...intent,
            retryOf: {
              rewatch: false,
              unsent: asked.filter((provider) => !maybeLanded.includes(provider)),
              unanswered: maybeLanded,
            },
          };
        }
      }

      const plan = await planLogWrite(queryClient, variables, connected);
      const replayed =
        replay == null
          ? null
          : beginReplay(
              replay,
              (variables.providers ?? []).filter((provider) => !plan.unread.has(provider)),
            );
      if (plan.targets.length === 0) {
        if (replay == null || replayed == null) {
          throw new Error(`No connected provider can log "${plan.item.title}"`);
        }
        // Thrown, the record would block every log queued behind it.
        settleReplay(replay, replayed, []);
        return { outcomes: [], succeeded: [], failed: [], skipped: [], queued: [], rewatch: false };
      }
      const { item, targets, skipped } = plan;

      const result = await fanOutLog(
        withUnread(
          withUnconfirmed(
            withMappingSkips(logAdapters(queryClient), plan.mappingSkips),
            plan.unconfirmed,
          ),
          plan.unread,
        ),
        plan.writeTargets,
        plan.variables,
      );

      const traktId = item.externalIds.trakt;
      const loggedEpisodes = plan.variables.episodes;
      if (result.succeeded.includes(Provider.Trakt) && traktId != null && loggedEpisodes != null) {
        queryClient.setQueryData<TraktShowProgressResult>(
          traktQueryKeys.showProgress(traktId),
          (progress) =>
            progress == null
              ? progress
              : {
                  ...progress,
                  watchedKeys: new Set([
                    ...progress.watchedKeys,
                    ...loggedEpisodes.map((episode) => `${episode.season}-${episode.number}`),
                  ]),
                },
        );
      }
      // A retry or replay checks fresh state. An in-sync skip there can be the first evidence
      // a write landed, so its other reads still need invalidation.
      const landed =
        variables.retryOf == null ? result.succeeded : [...result.succeeded, ...skipped];
      const settled = invalidateAfterLog(queryClient, item, landed, [
        ...skipped,
        ...result.skipped,
      ]);

      // The derived Letterboxd watchlist removal runs after the film log without holding the
      // sheet for another WebView round trip.
      if (result.succeeded.length > 0) {
        void removeWatchedFromWatchlist(queryClient, item, connected);
      }

      if (variables.tags != null && variables.tags.length > 0 && result.succeeded.length > 0) {
        recordRecentTags(variables.tags);
      }

      // Iterate the original targets so mapping skips still have an outcome even without a
      // reconcile decision.
      let outcomes: ProviderWriteOutcome[] = targets.map((provider) =>
        skipped.includes(provider)
          ? { provider, status: 'skipped' }
          : (result.outcomes.find((o) => o.provider === provider) ?? {
              provider,
              status: 'error',
              message: 'missing outcome',
            }),
      );

      let queued: ProviderId[] = [];
      if (replay != null && replayed != null) {
        settleReplay(replay, replayed, outcomes);
      } else {
        // No answer came back, so the write may have landed. Keep it where a
        // fresh read can prove it did not, and send it again later. A rewatch
        // has no such proof: the provider records the watch either way.
        const unanswered = plan.rewatch
          ? []
          : outcomes
              .filter((outcome) => outcome.status === 'error' && outcome.transient === 'network')
              .map((outcome) => outcome.provider)
              .filter(
                (provider) =>
                  canQueueLog(provider, currentPlatform()) && logReadProvesAbsence(provider),
              );
        if (unanswered.length > 0 && queuePendingLog(intent, unanswered, 'uncertain')) {
          queued = unanswered;
          outcomes = outcomes.map((outcome) =>
            queued.includes(outcome.provider)
              ? { provider: outcome.provider, status: 'queued' }
              : outcome,
          );
        }
      }

      return {
        ...result,
        outcomes,
        failed: result.failed.filter((provider) => !queued.includes(provider)),
        skipped,
        queued,
        unanswered: variables.retryOf?.unanswered,
        rewatch: plan.rewatch,
        settled,
      };
    },
  });
}
