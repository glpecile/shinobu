import { Effect } from 'effect';

import {
  ProviderAuthError,
  ProviderDecodeError,
  ProviderNetworkError,
  ProviderRateLimitError,
  type ProviderError,
} from '@/lib/providers/errors';
import type { NormalizedMediaItem } from '@/types/media';
import { LETTERBOXD_BASE_URL } from './config';
import type { LetterboxdDeps } from './deps';
import { normalizeWatchlistFilm } from './normalize';

/** One film scraped off the public watchlist page. */
export interface LetterboxdWatchlistFilm {
  /** The film's URL slug — Shinobu's Letterboxd external id. */
  slug: string;
  title: string;
  year?: number;
  /** Letterboxd's internal numeric film id — the poster CDN path key. */
  filmId?: number;
  /** Poster cache-busting key (`?v=`); optional, the CDN serves without it. */
  cacheBustingKey?: string;
}

/** Minimal entity decoding for the handful Letterboxd emits in attributes. */
function decodeEntities(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`${name}=(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return match == null ? null : (match[1] ?? match[2] ?? null);
}

/** "Tuner (2025)" → { title: "Tuner", year: 2025 }; year is trailing-anchored. */
function splitNameAndYear(name: string): { title: string; year?: number } {
  const match = /^(.*)\s\((\d{4})\)$/.exec(name);
  if (match == null) return { title: name };
  return { title: match[1], year: Number(match[2]) };
}

/**
 * Parses the watchlist page's film grid. Each film renders as a `LazyPoster`
 * react-component div whose data attributes carry everything we need — the
 * real poster art only ever arrives via Cloudflare-challenged AJAX, so the
 * numeric id + cache key here feed the constructed CDN URL instead
 * (docs/solutions/letterboxd-no-api-fallback.md). Pure for fixture testing.
 */
export function parseWatchlistPage(html: string): LetterboxdWatchlistFilm[] {
  const components =
    html.match(/<div\b[^>]*data-component-class="LazyPoster"[^>]*>/g) ?? [];

  const films: LetterboxdWatchlistFilm[] = [];
  for (const component of components) {
    const slug = attribute(component, 'data-item-slug');
    const name = attribute(component, 'data-item-name');
    if (slug == null || name == null) continue;

    const identifier = decodeEntities(
      attribute(component, 'data-postered-identifier') ?? '',
    );
    const posterPath = decodeEntities(
      attribute(component, 'data-resolvable-poster-path') ?? '',
    );
    const filmId = /film:(\d+)/.exec(identifier)?.[1];
    const cacheBustingKey = /"cacheBustingKey":"([^"]+)"/.exec(posterPath)?.[1];

    films.push({
      slug,
      ...splitNameAndYear(decodeEntities(name)),
      ...(filmId != null ? { filmId: Number(filmId) } : {}),
      ...(cacheBustingKey != null ? { cacheBustingKey } : {}),
    });
  }
  return films;
}

/**
 * The user's public watchlist, first page (28 films), normalized. A 404 means
 * the username no longer resolves (renamed/deleted account) — surfaced as a
 * dead session so the UI's move is "reconnect Letterboxd".
 */
export function getWatchlist(
  deps: LetterboxdDeps,
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  const username = deps.username;
  if (username == null || username === '') {
    return Effect.fail(
      new ProviderAuthError({ provider: 'letterboxd', refreshFailed: true }),
    );
  }

  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => deps.fetch(`${LETTERBOXD_BASE_URL}/${username}/watchlist/`),
      catch: (cause) => new ProviderNetworkError({ provider: 'letterboxd', cause }),
    });

    if (response.status === 404) {
      return yield* new ProviderAuthError({
        provider: 'letterboxd',
        refreshFailed: true,
      });
    }
    if (response.status === 429) {
      return yield* new ProviderRateLimitError({ provider: 'letterboxd' });
    }
    if (!response.ok) {
      return yield* new ProviderNetworkError({
        provider: 'letterboxd',
        cause: new Error(`Letterboxd responded ${response.status} for /${username}/watchlist/`),
      });
    }

    const html = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: () =>
        new ProviderDecodeError({
          provider: 'letterboxd',
          detail: 'unreadable watchlist page body',
        }),
    });

    const fetchedAt = new Date().toISOString();
    return parseWatchlistPage(html).map((film) =>
      normalizeWatchlistFilm(film, fetchedAt),
    );
  });
}

/**
 * Whether a public profile exists for `username` — the connect-time
 * validation (plan 0012 decision 1). Uses the RSS URL because a 404 there is
 * an unambiguous "no such member" while profile pages can soft-redirect.
 */
export function checkUsernameExists(
  deps: Pick<LetterboxdDeps, 'fetch'>,
  username: string,
): Effect.Effect<boolean, ProviderError> {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => deps.fetch(`${LETTERBOXD_BASE_URL}/${username}/rss/`),
      catch: (cause) => new ProviderNetworkError({ provider: 'letterboxd', cause }),
    });
    if (response.status === 404) return false;
    if (response.status === 429) {
      return yield* new ProviderRateLimitError({ provider: 'letterboxd' });
    }
    if (!response.ok) {
      return yield* new ProviderNetworkError({
        provider: 'letterboxd',
        cause: new Error(`Letterboxd responded ${response.status} validating username`),
      });
    }
    return true;
  });
}
