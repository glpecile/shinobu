import { Effect, Schema } from 'effect';

import { ProviderAuthError, ProviderDecodeError, ProviderNetworkError, ProviderRateLimitError } from '@/lib/providers/errors';
import type { NormalizedMediaItem } from '@/types/media';
import { LETTERBOXD_BASE_URL } from './config';
import type { LetterboxdDeps } from './deps';

const Username = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,39}$/));
const Slug = Schema.String.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), Schema.isMaxLength(200));

const FILM_URL = /^(?:https:\/\/letterboxd\.com)?\/film\/([^/]+)\/$/;

const fetchPage = Effect.fnUntraced(function* (deps: Pick<LetterboxdDeps, 'fetch'>, path: string, redirect?: RequestRedirect) {
  const response = yield* Effect.tryPromise({
    try: (signal) => deps.fetch(`${LETTERBOXD_BASE_URL}/${path}`, { signal, redirect }),
    catch: (cause) => new ProviderNetworkError({ provider: 'letterboxd', cause }),
  });
  if (response.status === 404) return null;
  if (response.status === 429) return yield* new ProviderRateLimitError({ provider: 'letterboxd' });
  if (!response.ok && (redirect !== 'manual' || response.status < 300 || response.status >= 400)) return yield* new ProviderNetworkError({ provider: 'letterboxd', status: response.status, cause: new Error('Watched film page could not be loaded') });
  return response;
});

const readText = (response: Response) => Effect.tryPromise({
  try: () => response.text(),
  catch: () => new ProviderDecodeError({ provider: 'letterboxd', detail: 'unreadable watched film page' }),
});

/** The film's Letterboxd slug via its `tmdb/{id}/` redirect; null when Letterboxd has no such film. */
export const resolveFilmSlug = Effect.fnUntraced(function* (deps: Pick<LetterboxdDeps, 'fetch'>, tmdbId: number) {
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'invalid TMDB film id' });
  // Native stops at the 302 and reads its relative `Location` (empty body),
  // so the ~300 KB film page is never downloaded. The web proxy follows the
  // redirect server-side and answers 200 under its own URL, so web reads og:url.
  const redirect = yield* fetchPage(deps, `tmdb/${tmdbId}/`, 'manual');
  if (redirect == null) return null;
  const slug = FILM_URL.exec(redirect.headers.get('location') ?? redirect.url)?.[1]
    ?? /<meta\b[^>]*property="og:url"[^>]*content="https:\/\/letterboxd\.com\/film\/([^/]+)\/"/.exec(yield* readText(redirect))?.[1];
  if (slug == null) return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'TMDB redirect has no film identity' });
  return slug;
});

/** Public viewings supply positive evidence; a missing page does not prove unwatched. Needs the item's slug. */
export const getLetterboxdFilmWatch = Effect.fn('letterboxd.getFilmWatch')(function* (deps: LetterboxdDeps, item: NormalizedMediaItem) {
  if (!Schema.is(Username)(deps.username)) return yield* new ProviderAuthError({ provider: 'letterboxd', refreshFailed: true });
  const slug = item.externalIds.letterboxd;
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
