import * as Effect from 'effect/Effect';

import { ProviderNetworkError, type ProviderError } from '@/lib/providers/errors';
import type { ProviderWriteResult } from '@/features/log-media/fan-out';
import type { NormalizedMediaItem } from '@/types/media';
import type { SerializdDeps } from './deps';
import { serializdHttp } from './http';
import { getRawShowProgress } from './progress';
import { isYearBasedSeason, resolveSeasonId } from './season-id';
import { getSerializdShow } from './show';
import { resumeOnSerializd } from './tracking';

export interface SerializdLogOptions {
  /** Single episode watch. Mutually exclusive with `episodes`. */
  episode?: { season: number; number: number };
  /** A batch (one or more episodes of the same show — e.g. a whole season). */
  episodes?: Array<{ season: number; number: number }>;
  /** ISO instant — the diary entry's `backdate` (R8). Omitted = now. */
  watchedAt?: string;
  tags?: string[];
  liked?: boolean;
  /** Parity rewatch from the fan-out's reconcile step (R10). */
  rewatch?: boolean;
}

function tagList(options: SerializdLogOptions): string[] {
  return (options.tags ?? []).map((tag) => tag.trim()).filter((tag) => tag !== '');
}

function skip(reason: string): ProviderWriteResult {
  return { status: 'skipped', reason };
}

/**
 * `/show/reviews/add` — the dated diary entry that mirrors how a Shinobu log
 * lands on the other providers (R8). This is what makes a "mark as watched"
 * actually *show up* on serializd.com's diary, not just move progress. Rating /
 * review text are out of scope (Scope Boundaries) so they go out empty.
 * `episode_number` is set for a single-episode log and omitted for a
 * whole-season log (a season-level diary entry), matching what serializd.com's
 * own UI produces.
 */
function addDiaryEntry(
  deps: SerializdDeps,
  params: {
    showId: number;
    seasonId: number;
    episodeNumber?: number;
    backdate: string;
    tags: string[];
    rewatch: boolean;
    liked: boolean;
  },
): Effect.Effect<unknown, ProviderError> {
  return serializdHttp(deps, '/show/reviews/add', {
    method: 'POST',
    auth: true,
    body: {
      show_id: params.showId,
      season_id: params.seasonId,
      ...(params.episodeNumber != null ? { episode_number: params.episodeNumber } : {}),
      backdate: params.backdate,
      review_text: '',
      rating: 0,
      contains_spoiler: false,
      is_log: true,
      is_rewatch: params.rewatch,
      tags: params.tags,
      allows_comments: true,
      like: params.liked,
    },
  });
}

/**
 * Write Serializd logs using the item's TMDB id. A partial write can leave progress even when
 * the diary write fails.
 */
export function logToSerializd(
  deps: SerializdDeps,
  item: NormalizedMediaItem,
  options: SerializdLogOptions = {},
): Effect.Effect<ProviderWriteResult, ProviderError> {
  const tmdbId = item.externalIds.tmdb;
  if (tmdbId == null) {
    return Effect.succeed(
      skip(`"${item.title}" has no TMDB id — Serializd needs it as the join key`),
    );
  }

  const episodes =
    options.episodes != null && options.episodes.length > 0
      ? options.episodes
      : options.episode != null
        ? [options.episode]
        : [];
  if (episodes.length === 0) {
    return Effect.succeed(skip('no episode specified to log to Serializd'));
  }

  const backdate = options.watchedAt ?? new Date().toISOString();
  const rewatch = options.rewatch === true;
  const tags = tagList(options);

  // Group episode numbers by season — one watched + diary write per season.
  const bySeason = new Map<number, number[]>();
  for (const episode of episodes) {
    const numbers = bySeason.get(episode.season) ?? [];
    numbers.push(episode.number);
    bySeason.set(episode.season, numbers);
  }

  return Effect.gen(function* () {
    let wroteAny = false;
    let firstSkipReason: string | null = null;

    for (const [seasonNumber, rawNumbers] of bySeason) {
      if (isYearBasedSeason(seasonNumber)) {
        firstSkipReason ??= `season ${seasonNumber} looks year-based (≥2000) — no Serializd equivalent`;
        continue;
      }
      const seasonId = yield* resolveSeasonId(deps, { tmdbId, seasonNumber });
      if (seasonId == null) {
        firstSkipReason ??= `Serializd has no season ${seasonNumber} for this show yet (will retry)`;
        continue;
      }

      const numbers = [...new Set(rawNumbers)].sort((a, b) => a - b);

      // Watched first, then the diary entry (R8). A diary failure after a
      // successful watched call propagates as an error — NOT reported as ok.
      yield* serializdHttp(deps, '/episode_log/add', {
        method: 'POST',
        auth: true,
        body: {
          episode_numbers: numbers,
          season_id: seasonId,
          show_id: tmdbId,
          should_get_next_episode: false,
        },
      });
      yield* addDiaryEntry(deps, {
        showId: tmdbId,
        seasonId,
        // Episode-level entry for a single episode; season-level otherwise.
        ...(numbers.length === 1 ? { episodeNumber: numbers[0] } : {}),
        backdate,
        tags,
        rewatch,
        liked: options.liked === true,
      });
      wroteAny = true;
    }

    if (!wroteAny) {
      return skip(firstSkipReason ?? 'Serializd could not resolve any logged season yet');
    }
    // The log landed, so a failed resume must not report it as failed: a retry
    // would write a second diary entry. The next log tries the resume again.
    yield* resumeOnSerializd(deps, tmdbId).pipe(Effect.ignore);
    return { status: 'ok' } satisfies ProviderWriteResult;
  });
}

/**
 * What the Serializd watchlist verbs resolve. Structurally a `ProviderWriteResult`
 * — every member is assignable to one — widened by the single field R16 demands
 * of *this* provider: an `ok` that carries the reason naming what the KTD-10
 * guard left alone. A partial Serializd add reported as a bare `ok` would tell
 * the user "watchlisted" after writing two of five seasons, and with no
 * Serializd read leg (R32) nothing downstream ever corrects the impression.
 *
 * The reason only reaches the UI once `ProviderWriteOutcome`'s `ok` member
 * carries it too (`features/log-media/fan-out.ts` rebuilds outcomes and today
 * drops it) — that widening is outside this adapter's file set, and the value
 * is produced here so the surface change is one line elsewhere rather than a
 * re-derivation of the guard.
 */
export type SerializdWatchlistResult =
  | { status: 'ok'; reason?: string }
  | { status: 'skipped'; reason: string };

interface WatchlistSeasons {
  /** Serializd season ids eligible to be watchlisted — never a watched one. */
  seasonIds: number[];
  /** Season numbers filtered out because the user has watched them (R16 copy). */
  watchedNumbers: number[];
}

/** "S1", "S1 and S2", "S1, S2 and S3" — the reason line's subject (R16). */
function seasonList(numbers: readonly number[]): string {
  const labels = numbers.map((number) => `S${number}`);
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/**
 * The reason both verbs attach: an `ok` naming what the guard left alone (R16),
 * or — when nothing at all was eligible — the skip that says why. Shared so the
 * add and the remove cannot drift into two different stories about one guard.
 */
function watchedReason(watchedNumbers: readonly number[]): string {
  return `${seasonList(watchedNumbers)} ${
    watchedNumbers.length === 1 ? 'is' : 'are'
  } already watched on Serializd`;
}

function noEligibleSeasonSkip(watchedNumbers: readonly number[]): ProviderWriteResult {
  return skip(
    watchedNumbers.length > 0
      ? 'already watched on Serializd'
      : 'Serializd lists no watchlistable season for this show yet',
  );
}

/**
 * Serializd's raw progress preserves seasons with no episode rows. Its retired per-show
 * progress route returns 404, so allow that case to proceed. Watched and watchlisted seasons
 * can coexist (docs/solutions/serializd-watchlist-clears-watched.md).
 */
function watchlistSeasons(
  deps: SerializdDeps,
  tmdbId: number,
): Effect.Effect<WatchlistSeasons, ProviderError> {
  return Effect.gen(function* () {
    const show = yield* getSerializdShow(deps, { tmdbId });
    const progress = yield* getRawShowProgress(deps, { tmdbId }).pipe(
      Effect.catchIf(
        (error): error is ProviderNetworkError =>
          error._tag === 'ProviderNetworkError' && error.status === 404,
        () => Effect.succeed({ watchedSeasons: [] }),
      ),
    );

    // seasonNumber → how many episodes progress reports watched. Presence in
    // this map is itself the "watched" signal (see the docblock).
    const watchedEpisodeCounts = new Map<number, number>();
    for (const season of progress.watchedSeasons ?? []) {
      if (season.seasonNumber == null) continue;
      watchedEpisodeCounts.set(season.seasonNumber, season.watchedEpisodes?.length ?? 0);
    }

    const seasonIds: number[] = [];
    const watchedNumbers: number[] = [];
    for (const season of show.seasons ?? []) {
      const number = season.seasonNumber;
      if (number == null || season.id == null) continue;
      if (number <= 0 || isYearBasedSeason(number)) continue;

      const watchedCount = watchedEpisodeCounts.get(number);
      const fullyWatched =
        season.episodeCount != null &&
        season.episodeCount > 0 &&
        (watchedCount ?? 0) >= season.episodeCount;
      if (watchedCount != null || fullyWatched) {
        watchedNumbers.push(number);
        continue;
      }
      seasonIds.push(season.id);
    }

    return { seasonIds, watchedNumbers };
  });
}

/**
 * Serializd watchlists are season-scoped. Read eligible season ids before posting and report
 * the watched seasons left alone.
 */
export function addToSerializdWatchlist(
  deps: SerializdDeps,
  item: NormalizedMediaItem,
): Effect.Effect<SerializdWatchlistResult, ProviderError> {
  const tmdbId = item.externalIds.tmdb;
  if (tmdbId == null) {
    return Effect.succeed(
      skip(`"${item.title}" has no TMDB id — Serializd needs it as the join key`),
    );
  }

  return Effect.gen(function* () {
    const { seasonIds, watchedNumbers } = yield* watchlistSeasons(deps, tmdbId);

    if (seasonIds.length === 0) return noEligibleSeasonSkip(watchedNumbers);

    yield* serializdHttp(deps, '/watchlist_v2', {
      method: 'POST',
      auth: true,
      body: { show_id: tmdbId, season_ids: seasonIds },
    });

    return {
      status: 'ok',
      ...(watchedNumbers.length > 0 ? { reason: watchedReason(watchedNumbers) } : {}),
    } satisfies SerializdWatchlistResult;
  });
}

/**
 * Use the same season filter as add. Removal remains manual until Serializd supplies watchlist
 * membership.
 */
export function removeFromSerializdWatchlist(
  deps: SerializdDeps,
  item: NormalizedMediaItem,
): Effect.Effect<SerializdWatchlistResult, ProviderError> {
  const tmdbId = item.externalIds.tmdb;
  if (tmdbId == null) {
    return Effect.succeed(
      skip(`"${item.title}" has no TMDB id — Serializd needs it as the join key`),
    );
  }

  return Effect.gen(function* () {
    const { seasonIds, watchedNumbers } = yield* watchlistSeasons(deps, tmdbId);

    if (seasonIds.length === 0) return noEligibleSeasonSkip(watchedNumbers);

    yield* serializdHttp(deps, '/watchlist/remove_v2', {
      method: 'POST',
      auth: true,
      body: { show_id: tmdbId, season_ids: seasonIds, async: true },
    });

    return {
      status: 'ok',
      ...(watchedNumbers.length > 0 ? { reason: watchedReason(watchedNumbers) } : {}),
    } satisfies SerializdWatchlistResult;
  });
}
