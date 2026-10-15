import { Effect, Schema } from 'effect';

import { ProviderAuthError, ProviderDecodeError, ProviderNetworkError, ProviderRateLimitError } from '@/lib/providers/errors';
import type { NormalizedMediaItem } from '@/types/media';
import { LETTERBOXD_BASE_URL } from './config';
import type { LetterboxdDeps } from './deps';

const Username = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,39}$/));
const Slug = Schema.String.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), Schema.isMaxLength(200));

const readPage = Effect.fnUntraced(function* (deps: LetterboxdDeps, path: string) {
  const response = yield* Effect.tryPromise({
    try: (signal) => deps.fetch(`${LETTERBOXD_BASE_URL}/${path}`, { signal }),
    catch: (cause) => new ProviderNetworkError({ provider: 'letterboxd', cause }),
  });
  if (response.status === 404) return null;
  if (response.status === 429) return yield* new ProviderRateLimitError({ provider: 'letterboxd' });
  if (!response.ok) return yield* new ProviderNetworkError({ provider: 'letterboxd', status: response.status, cause: new Error('Watched film page could not be loaded') });
  return yield* Effect.tryPromise({
    try: () => response.text(),
    catch: () => new ProviderDecodeError({ provider: 'letterboxd', detail: 'unreadable watched film page' }),
  });
});

/** Public viewings supply positive evidence; a missing page does not prove unwatched. */
export const getLetterboxdFilmWatch = Effect.fn('letterboxd.getFilmWatch')(function* (deps: LetterboxdDeps, item: NormalizedMediaItem) {
  if (!Schema.is(Username)(deps.username)) return yield* new ProviderAuthError({ provider: 'letterboxd', refreshFailed: true });
  let slug = item.externalIds.letterboxd;
  if (slug == null && item.externalIds.tmdb != null) {
    if (!Number.isSafeInteger(item.externalIds.tmdb) || item.externalIds.tmdb <= 0) return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'invalid TMDB film id' });
    const html = yield* readPage(deps, `tmdb/${item.externalIds.tmdb}/`);
    if (html == null) return null;
    slug = /<meta\b[^>]*property="og:url"[^>]*content="https:\/\/letterboxd\.com\/film\/([^/]+)\/"/.exec(html)?.[1];
    if (slug == null) return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'TMDB redirect has no film identity' });
  }
  if (slug == null) return null;
  if (!Schema.is(Slug)(slug)) return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'invalid film slug' });
  const html = yield* readPage(deps, `${deps.username}/film/${slug}/`);
  if (html == null) return null;
  const owner = /<body\b[^>]*data-owner="([^"]+)"/.exec(html)?.[1];
  const section = /<section\b[^>]*class="[^"]*\bfilm-viewing-info-wrapper\b[^"]*"[^>]*>([\s\S]*?)<\/section>/.exec(html)?.[1];
  if (owner?.toLowerCase() !== deps.username.toLowerCase() || section == null || !section.includes(`href="/film/${slug}/"`)) {
    return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'unrecognized member film viewing' });
  }
  return { ...item, externalIds: { ...item.externalIds, letterboxd: slug }, currentProgress: 1 };
});
