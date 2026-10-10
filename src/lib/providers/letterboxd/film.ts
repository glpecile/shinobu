import { Effect, Schema } from 'effect';

import { ProviderDecodeError, ProviderNetworkError, ProviderRateLimitError, type ProviderError } from '@/lib/providers/errors';
import type { HttpFetch } from '@/lib/http/types';
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

/** Public film HTML carries an exact TMDB movie ID; no session or title search. */
export const getFilmTmdbId = Effect.fnUntraced(function* (
  deps: { fetch: HttpFetch },
  slug: string,
): Effect.fn.Return<number | null, ProviderError> {
  const html = yield* getFilmHtml(deps, slug);
  if (html == null) return null;
  const body = /<body\b[^>]*>/i.exec(html)?.[0] ?? '';
  const id = /\bdata-tmdb-id=["']([1-9][0-9]*)["']/.exec(body)?.[1];
  if (!/\bdata-tmdb-type=["']movie["']/.test(body) || id == null || !Number.isSafeInteger(Number(id))) {
    return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'Film page has no TMDB movie ID' });
  }
  return Number(id);
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
