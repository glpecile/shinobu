import { Effect, Schema } from 'effect';

import { ProviderAuthError, ProviderDecodeError, ProviderNetworkError, ProviderRateLimitError } from '@/lib/providers/errors';
import type { NormalizedMediaItem } from '@/types/media';
import { LETTERBOXD_BASE_URL } from './config';
import type { LetterboxdDeps } from './deps';

const Username = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,39}$/));
const Slug = Schema.String.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), Schema.isMaxLength(200));

const FILM_URL = /^https:\/\/letterboxd\.com\/film\/([^/]+)\/$/;

const fetchPage = Effect.fnUntraced(function* (deps: Pick<LetterboxdDeps, 'fetch'>, path: string) {
  const response = yield* Effect.tryPromise({
    try: (signal) => deps.fetch(`${LETTERBOXD_BASE_URL}/${path}`, { signal }),
    catch: (cause) => new ProviderNetworkError({ provider: 'letterboxd', cause }),
  });
  if (response.status === 404) return null;
  if (response.status === 429) return yield* new ProviderRateLimitError({ provider: 'letterboxd' });
  if (!response.ok) return yield* new ProviderNetworkError({ provider: 'letterboxd', status: response.status, cause: new Error('Watched film page could not be loaded') });
  return response;
});

const readText = (response: Response) => Effect.tryPromise({
  try: () => response.text(),
  catch: () => new ProviderDecodeError({ provider: 'letterboxd', detail: 'unreadable watched film page' }),
});

/** The film's Letterboxd slug via its `tmdb/{id}/` redirect; null when Letterboxd has no such film. */
export const resolveFilmSlug = Effect.fnUntraced(function* (deps: Pick<LetterboxdDeps, 'fetch'>, tmdbId: number) {
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'invalid TMDB film id' });
  const redirect = yield* fetchPage(deps, `tmdb/${tmdbId}/`);
  if (redirect == null) return null;
  // Native fetch follows the redirect, so the URL names the film and its
  // ~270 KB page is never decoded on the JS thread, once per scrolled row.
  // The web proxy answers under its own URL, so it reads the page's og:url.
  const slug = FILM_URL.exec(redirect.url)?.[1]
    ?? /<meta\b[^>]*property="og:url"[^>]*content="https:\/\/letterboxd\.com\/film\/([^/]+)\/"/.exec(yield* readText(redirect))?.[1];
  if (slug == null) return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'TMDB redirect has no film identity' });
  return slug;
});

/** Public viewings supply positive evidence; a missing page does not prove unwatched. */
export const getLetterboxdFilmWatch = Effect.fn('letterboxd.getFilmWatch')(function* (deps: LetterboxdDeps, item: NormalizedMediaItem) {
  if (!Schema.is(Username)(deps.username)) return yield* new ProviderAuthError({ provider: 'letterboxd', refreshFailed: true });
  const slug = item.externalIds.letterboxd
    ?? (item.externalIds.tmdb == null ? null : yield* resolveFilmSlug(deps, item.externalIds.tmdb));
  if (slug == null) return null;
  if (!Schema.is(Slug)(slug)) return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'invalid film slug' });
  const page = yield* fetchPage(deps, `${deps.username}/film/${slug}/`);
  if (page == null) return null;
  const html = yield* readText(page);
  const owner = /<body\b[^>]*data-owner="([^"]+)"/.exec(html)?.[1];
  const section = /<section\b[^>]*class="[^"]*\bfilm-viewing-info-wrapper\b[^"]*"[^>]*>([\s\S]*?)<\/section>/.exec(html)?.[1];
  if (owner?.toLowerCase() !== deps.username.toLowerCase() || section == null || !section.includes(`href="/film/${slug}/"`)) {
    return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'unrecognized member film viewing' });
  }
  return { ...item, externalIds: { ...item.externalIds, letterboxd: slug }, currentProgress: 1 };
});
