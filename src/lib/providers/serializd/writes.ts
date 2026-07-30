import { Effect } from 'effect';

import type { ProviderError } from '@/lib/providers/errors';
import type { ProviderWriteResult } from '@/features/log-media/fan-out';
import type { NormalizedMediaItem } from '@/types/media';
import type { SerializdDeps } from './deps';
import { serializdHttp } from './http';
import { getRawShowProgress } from './progress';
import { isYearBasedSeason, resolveSeasonId } from './season-id';
import { getSerializdShow } from './show';

export interface SerializdLogOptions {
  /** Single episode watch. Mutually exclusive with `episodes`. */
  episode?: { season: number; number: number };
  /** A batch (one or more episodes of the same show — e.g. a whole season). */
  episodes?: Array<{ season: number; number: number }>;
  /** ISO instant — the diary entry's `backdate` (R8). Omitted = now. */
  watchedAt?: string;
  /** Diary tags (R10). */
  tags?: string[];
  /** Parity rewatch from the fan-out's reconcile step (R10). */
  rewatch?: boolean;
}

/** Trimmed, non-empty diary tags. */
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
      like: false,
    },
  });
}

/**
 * The Serializd write adapter the `useLogMedia` fan-out targets (plan 0017 R8).
 * TMDB is the join key (KTD2) — no `tmdb` id means no way to reach Serializd, a
 * `skipped` value (never a throw, so it can't fail the fan-out).
 *
 * Every log — a single episode OR a whole-season batch — both marks the
 * episode(s) watched (`/episode_log/add`) AND writes a dated diary entry
 * (`/show/reviews/add`), grouped by season. This is deliberate: marking watched
 * alone leaves nothing on the user's serializd.com diary, which was the whole
 * point of a "log". Order matters (R8): watched first, diary second — if the
 * episode call succeeds but the diary call fails, the diary error propagates (an
 * `error` outcome, not `ok`) so reconcile knows the entry is absent and
 * re-attempts it (R12) rather than skipping on progress.
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
      });
      wroteAny = true;
    }

    if (!wroteAny) {
      return skip(firstSkipReason ?? 'Serializd could not resolve any logged season yet');
    }
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
 * KTD-10's guard, steps 0–1: enumerate the show's seasons, read progress, and
 * return only the season ids Shinobu is entitled to watchlist.
 *
 * **Why a read at all.** Serializd's own copy is explicit — *"You can't mark a
 * show / season as 'Watched' and 'Watchlisted' at the same time"* — so posting
 * every season id of a partly-watched show plausibly clears those seasons'
 * watched flags (R21; NAMED RISK, inferred from product copy and probed in
 * U10). The site's show-level button is entitled to clear its own state because
 * the user pressed its own control; Shinobu is not, because the user pressed a
 * cross-provider "Add to watchlist" with no idea Serializd models it per-season.
 *
 * **Why the raw progress body and not `getWatchedEpisodeKeys`.** That helper
 * flattens `watchedSeasons` into `${season}-${episode}` keys and therefore drops
 * any season whose `watchedEpisodes` array is empty or absent — exactly the
 * shape a season marked watched wholesale (`POST /watched_v2`, which writes no
 * episode rows) takes. Built on the key set, this guard would treat such a
 * season as never-touched and send it, i.e. fail **open** in the one scenario it
 * exists for. So a season counts as watched if it appears in `watchedSeasons`
 * **at all**, or if its watched-episode count is ≥ the `episodeCount` the show
 * payload reports; only a season absent from `watchedSeasons` with zero watched
 * episodes is eligible.
 *
 * **The eligible set is specified, not implicit.** Season 0 / specials are
 * excluded (Serializd's copy says "Specials not affected", so a specials id is
 * at best a no-op and at worst a 4xx that fails the whole add) and year-based
 * seasons are excluded for the same reason the log path skips them permanently
 * (`isYearBasedSeason`). Seasons whose payload carries no `id` or `seasonNumber`
 * are dropped rather than guessed at — the `seasonNumber` ↔ `id` join is what
 * the whole guard rests on.
 *
 * Both reads propagate their errors unchanged (branch 0): the caller never
 * writes on a failed read, and the tagged error keeps its own semantics — a 401
 * must still read as "reconnect Serializd", not as a generic guard failure.
 */
function watchlistSeasons(
  deps: SerializdDeps,
  tmdbId: number,
): Effect.Effect<WatchlistSeasons, ProviderError> {
  return Effect.gen(function* () {
    const show = yield* getSerializdShow(deps, { tmdbId });
    const progress = yield* getRawShowProgress(deps, { tmdbId });

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
 * The Serializd watchlist-**add** adapter (plan 0031 U9, KTD-10 branches 0–3).
 * TMDB is the join key (KTD2) — no `tmdb` id is a `skipped` value, never a throw.
 *
 * Unlike every other watchlist target, this one is not a single POST: Serializd's
 * watchlist is season-keyed and `season_ids` is required, so "show-level" here
 * means *all seasons* and the adapter must enumerate them (KTD-7). That is
 * contained entirely inside this file — `RoutableItem` is unchanged and the
 * payload crossing the routing boundary is still `{ item }` (R3) — at a cost of
 * three requests: the show read, the progress read, the write.
 *
 * The branches, mirroring KTD-2's structure on AniList:
 *
 * 0. Either read fails → the error propagates, so the fan-out reports Serializd
 *    as `error` with R17's manual link attached, and **no POST is issued**. The
 *    guard is deliberately **fail-closed**: the log path's "a failed state read
 *    counts as 'doesn't have it'" rule is safe there and destructive here.
 * 2. Eligible, unwatched season ids → `POST /watchlist_v2`.
 * 3. No eligible ids → a reasoned skip, **never a write**. "Already watched on
 *    Serializd" when the guard filtered everything out; a distinct reason when
 *    the catalogue simply lists nothing watchlistable (specials-only, year-based
 *    seasons, or a body with no usable per-season ids — see `RawShowResponse`).
 *
 * A *partial* filter is an `ok` **carrying the reason** naming the seasons left
 * alone (R16) — never a bare success. Serializd's POST siblings are
 * boolean-success by convention (`client.py:356-360`) with no `added`/`existing`
 * signal, so this guard is the only place an "already there" story can come
 * from; a repeated add is upsert-shaped and harmless.
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
 * The Serializd watchlist-**remove** adapter (plan 0031 R34) —
 * `POST /watchlist/remove_v2 { show_id, season_ids, async: true }`. `async: true`
 * is what the site's own show-level removal sends; the response carries no
 * per-season detail, so success is boolean (R16) exactly like the add.
 *
 * It sends the **same filtered season set as the add**, and that is the point:
 * removal is *not* assumed hazard-free (R34's named risk). The mutual-exclusivity
 * behaviour behind KTD-10 is unverified in both directions, so a removal that
 * names watched seasons is exactly as capable of touching watched state as an
 * add is. U10 step 5 probes it directly (watchlist S2, remove with S1 included,
 * re-read progress).
 *
 * **Deliberately not on a live path in v1.** Serializd's `watchlistRemove` stays
 * declared `'manual'` in the registry: with no Serializd read leg (R32) it can
 * never appear in a `WatchlistEntry`'s `sources`, so a `'write'` declaration
 * would be an unreachable adapter behind a silent drop (R35). The upfront
 * "Remove on Serializd" link is the honest surface until the read lands; this
 * function exists so the flip is a one-token change, not a new implementation.
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
