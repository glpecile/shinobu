import { Effect, Schema } from 'effect';

import { ProviderDecodeError, ProviderNetworkError, ProviderRateLimitError, type ProviderError } from '@/lib/providers/errors';
import type { HttpFetch } from '@/lib/http/types';
import type { NormalizedMediaItem } from '@/types/media';
import type { TmdbDeps } from '@/lib/providers/tmdb/deps';
import { searchMovie, searchTitles } from '@/lib/providers/tmdb/reads';
import { titleKey } from '@/lib/providers/pick-movie-match';
import { LETTERBOXD_BASE_URL } from './config';

const getFilmHtml = Effect.fnUntraced(function* (
  deps: { fetch: HttpFetch },
  slug: string,
): Effect.fn.Return<string | null, ProviderError> {
  if (slug.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'Invalid film slug' });
  }
  const response = yield* Effect.tryPromise({
    try: (signal) => deps.fetch(`${LETTERBOXD_BASE_URL}/film/${slug}/`, { signal }),
    catch: (cause) => new ProviderNetworkError({ provider: 'letterboxd', cause }),
  });
  if (response.status === 404) return null;
  if (response.status === 429) return yield* new ProviderRateLimitError({ provider: 'letterboxd' });
  if (!response.ok) {
    return yield* new ProviderNetworkError({ provider: 'letterboxd', status: response.status, cause: new Error('Film page could not be loaded') });
  }
  return yield* Effect.tryPromise({
    try: () => response.text(),
    catch: (cause) => new ProviderNetworkError({ provider: 'letterboxd', cause }),
  });
});

const FilmMetadata = Schema.fromJsonString(Schema.Struct({
  '@type': Schema.Literal('Movie'),
  name: Schema.String,
  datePublished: Schema.optional(Schema.String),
  dateCreated: Schema.optional(Schema.String),
  duration: Schema.optional(Schema.String),
  genre: Schema.optional(Schema.Array(Schema.String)),
  image: Schema.optional(Schema.String.check(Schema.isPattern(/^https:\/\/a\.ltrbxd\.com\/resized\/[^\s]+$/))),
  description: Schema.optional(Schema.String),
}));

/** Preserve Letterboxd's log identity; a TV match is display-only, never a movie ID. */
export const getFilmItem = Effect.fnUntraced(function* (
  deps: { fetch: HttpFetch; tmdb: TmdbDeps | null },
  slug: string,
): Effect.fn.Return<NormalizedMediaItem | null, ProviderError> {
  const html = yield* getFilmHtml(deps, slug);
  if (html == null) return null;
  let metadata: typeof FilmMetadata.Type | null = null;
  for (const script of html.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const json = script[1].trim().replace(/^\/\*\s*<!\[CDATA\[\s*\*\//, '').replace(/\/\*\s*\]\]>\s*\*\/$/, '');
    metadata = yield* Schema.decodeUnknownEffect(FilmMetadata)(json).pipe(Effect.catch(() => Effect.succeed(null)));
    if (metadata != null) break;
  }
  if (metadata == null) return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'Film page has no metadata' });
  const year = Number((metadata.datePublished ?? metadata.dateCreated)?.slice(0, 4)) || undefined;
  const item: NormalizedMediaItem = {
    id: `letterboxd-${slug}`,
    title: metadata.name,
    year,
    coverImage: metadata.image ?? '',
    overview: metadata.description,
    runtime: Number(/^PT([0-9]+)M$/.exec(metadata.duration ?? '')?.[1]) || undefined,
    genres: metadata.genre == null ? undefined : [...metadata.genre],
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: new Date(0).toISOString(),
    externalIds: { letterboxd: slug },
  };
  const body = /<body\b[^>]*>/i.exec(html)?.[0] ?? '';
  const id = /\bdata-tmdb-id=["']([1-9][0-9]*)["']/.exec(body)?.[1];
  if (id != null && Number.isSafeInteger(Number(id))) {
    switch (/\bdata-tmdb-type=["']([^"']+)["']/.exec(body)?.[1]) {
      case 'movie': return { ...item, externalIds: { ...item.externalIds, tmdb: Number(id) } };
      case 'tv': return { ...item, tmdbTvVariant: Number(id) };
    }
  }
  if (deps.tmdb == null || year == null) return item;
  const matches = (items: NormalizedMediaItem[], type: 'MOVIE' | 'TV') => items.filter(
    (candidate) => candidate.type === type && candidate.year === year && titleKey(candidate.title) === titleKey(item.title),
  );
  const movieResults = yield* searchMovie(deps.tmdb, { query: item.title, year }).pipe(Effect.catch(() => Effect.succeed(null)));
  // A failed search cannot establish that no movie exists under this title.
  if (movieResults == null) return item;
  const movies = matches(movieResults, 'MOVIE');
  if (movies.length === 1) return { ...item, externalIds: { ...item.externalIds, tmdb: movies[0].externalIds.tmdb } };
  if (movies.length > 1) return item;
  const shows = matches(yield* searchTitles(deps.tmdb, { query: item.title }).pipe(Effect.catch(() => Effect.succeed([]))), 'TV');
  return shows.length === 1 ? { ...item, tmdbTvVariant: shows[0].externalIds.tmdb } : item;
});

const FilmPoster = Schema.fromJsonString(Schema.Struct({
  '@type': Schema.Literal('Movie'),
  image: Schema.String.check(Schema.isPattern(/^https:\/\/a\.ltrbxd\.com\/resized\/[^\s]+$/)),
}));

/** Exact portrait art; og:image is a landscape social preview, not a poster. */
export const getFilmPoster = Effect.fnUntraced(function* (
  deps: { fetch: HttpFetch },
  slug: string,
): Effect.fn.Return<string | null, ProviderError> {
  const html = yield* getFilmHtml(deps, slug);
  if (html == null) return null;
  for (const script of html.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    // Letterboxd wraps its JSON-LD in JavaScript CDATA comments.
    const json = script[1].trim().replace(/^\/\*\s*<!\[CDATA\[\s*\*\//, '').replace(/\/\*\s*\]\]>\s*\*\/$/, '');
    const film = yield* Schema.decodeUnknownEffect(FilmPoster)(json).pipe(
      Effect.catch(() => Effect.succeed(null)),
    );
    if (film != null) return film.image;
  }
  return null;
});
