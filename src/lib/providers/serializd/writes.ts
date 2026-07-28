import { Effect } from 'effect';

import type { ProviderError } from '@/lib/providers/errors';
import type { ProviderWriteResult } from '@/features/log-media/fan-out';
import type { NormalizedMediaItem } from '@/types/media';
import type { SerializdDeps } from './deps';
import { serializdHttp } from './http';
import { isYearBasedSeason, resolveSeasonId } from './season-id';

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
