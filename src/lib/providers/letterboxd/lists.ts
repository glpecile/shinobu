import { DateTime, Effect, Schema } from 'effect';

import {
  ProviderAuthError,
  ProviderDecodeError,
  ProviderNetworkError,
  ProviderRateLimitError,
} from '@/lib/providers/errors';
import type { NormalizedMediaItem } from '@/types/media';
import { LETTERBOXD_BASE_URL } from './config';
import type { LetterboxdDeps } from './deps';
import { normalizeWatchlistFilm } from './normalize';
import { parseWatchlistPage } from './watchlist';

export type LetterboxdListKind = 'created' | 'liked';

export interface LetterboxdList {
  id: string;
  title: string;
  owner: string;
  slug: string;
  filmCount?: number;
  previews: NormalizedMediaItem[];
}

export interface LetterboxdListsPage {
  lists: LetterboxdList[];
  hasNextPage: boolean;
}

export interface LetterboxdListFilmsPage {
  title: string;
  items: NormalizedMediaItem[];
  hasNextPage: boolean;
}

const Username = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,39}$/));
const Slug = Schema.String.check(Schema.isPattern(/^[a-z0-9-]{1,200}$/));
const Page = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 9999 }));

export function letterboxdListsUrl(username: string, kind: LetterboxdListKind): string | null {
  if (!Schema.is(Username)(username)) return null;
  return `${LETTERBOXD_BASE_URL}/${username}/${kind === 'liked' ? 'likes/lists/page/1' : 'lists'}/`;
}

export function letterboxdListUrl(owner: string, slug: string): string | null {
  if (!Schema.is(Username)(owner) || !Schema.is(Slug)(slug)) return null;
  return `${LETTERBOXD_BASE_URL}/${owner}/list/${slug}/`;
}

function text(html: string): string {
  return html.replaceAll(/<[^>]*>/g, '')
    .replaceAll('&quot;', '"').replaceAll('&#039;', "'").replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'").replaceAll('&nbsp;', ' ')
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&').trim();
}

function hasNextPage(html: string): boolean {
  return /<a\b[^>]*class="[^"]*\bnext\b[^"]*"[^>]*href="[^"]*\/page\/[1-9][0-9]{0,3}\/"/.test(html);
}

/** Each summary owns its preview films; sidebar art and description links aren't lists. */
export function parseListsPage(html: string, fetchedAt: string): LetterboxdListsPage {
  const articles = html.match(/<article\b[^>]*class="[^"]*\blist-summary\b[^"]*"[^>]*>[\s\S]*?<\/article>/g) ?? [];
  const lists: LetterboxdList[] = [];
  for (const article of articles) {
    const heading = /<h[23]\b[^>]*>[\s\S]*?<a\b[^>]*href="\/([^/]+)\/list\/([^/]+)\/"[^>]*>([\s\S]*?)<\/a>/.exec(article);
    if (heading == null) continue;
    const [, owner, slug, name] = heading;
    const title = text(name);
    if (letterboxdListUrl(owner, slug) == null || title === '') continue;
    const count = /class="value">([\d,]+)(?:&nbsp;|\s)+films?\b/.exec(article)?.[1];
    lists.push({
      id: `${owner}/${slug}`,
      owner,
      slug,
      title,
      ...(count != null ? { filmCount: Number(count.replaceAll(',', '')) } : {}),
      previews: parseWatchlistPage(article).slice(0, 4).map((film) => normalizeWatchlistFilm(film, fetchedAt)),
    });
  }
  return { lists, hasNextPage: hasNextPage(html) };
}

/** List grids share watchlist poster attributes, but may also have unrelated sidebar posters. */
export function parseListFilmsPage(html: string, fetchedAt: string): LetterboxdListFilmsPage {
  const title = text(/<h1\b[^>]*class="[^"]*\btitle-1\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '');
  const grid = /<ul\b[^>]*class="[^"]*\bposter-list\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/.exec(html)?.[1] ?? '';
  return {
    title,
    items: parseWatchlistPage(grid).map((film) => normalizeWatchlistFilm(film, fetchedAt)),
    hasNextPage: hasNextPage(html),
  };
}

const readPage = Effect.fn('letterboxd.readListPage')(function* (deps: Pick<LetterboxdDeps, 'fetch'>, url: string) {
  const response = yield* Effect.tryPromise({
    try: (signal) => deps.fetch(url, { signal }),
    catch: (cause) => new ProviderNetworkError({ provider: 'letterboxd', cause }),
  });
  if (response.status === 429) return yield* new ProviderRateLimitError({ provider: 'letterboxd' });
  if (!response.ok) return yield* new ProviderNetworkError({
    provider: 'letterboxd',
    cause: new Error(`Letterboxd responded ${response.status} loading this list. It may be private or no longer available.`),
  });
  return yield* Effect.tryPromise({
    try: () => response.text(),
    catch: () => new ProviderDecodeError({ provider: 'letterboxd', detail: 'unreadable list page' }),
  });
});

export const getListsPage = Effect.fn('letterboxd.getListsPage')(function* (
  deps: LetterboxdDeps,
  params: { kind: LetterboxdListKind; page: number },
) {
  const firstUrl = letterboxdListsUrl(deps.username ?? '', params.kind);
  if (firstUrl == null) return yield* new ProviderAuthError({ provider: 'letterboxd', refreshFailed: true });
  if (!Schema.is(Page)(params.page)) return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'invalid list page number' });
  const url = params.kind === 'liked'
    ? firstUrl.replace('/page/1/', `/page/${params.page}/`)
    : params.page === 1 ? firstUrl : `${firstUrl}page/${params.page}/`;
  const html = yield* readPage(deps, url);
  if (!html.includes('list-summary-list') && !/No\s+lists yet/.test(html)) return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'unrecognized lists page' });
  return parseListsPage(html, DateTime.formatIso(yield* DateTime.now));
});

export const getListFilmsPage = Effect.fn('letterboxd.getListFilmsPage')(function* (
  deps: Pick<LetterboxdDeps, 'fetch'>,
  params: { owner: string; slug: string; page: number },
) {
  const firstUrl = letterboxdListUrl(params.owner, params.slug);
  if (firstUrl == null || !Schema.is(Page)(params.page)) return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'invalid list address' });
  const html = yield* readPage(deps, params.page === 1 ? firstUrl : `${firstUrl}page/${params.page}/`);
  const result = parseListFilmsPage(html, DateTime.formatIso(yield* DateTime.now));
  if (result.title === '') return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'unrecognized list page' });
  return result;
});

/** A confirmed state set, never a toggle; unknown receipts cannot update the UI. */
export const setListLiked = Effect.fn('letterboxd.setListLiked')(function* (
  deps: LetterboxdDeps,
  params: { owner: string; slug: string; liked: boolean },
) {
  const url = letterboxdListUrl(params.owner, params.slug);
  if (url == null || !Schema.is(Schema.Boolean)(params.liked)) return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'invalid list like request' });
  const transport = deps.userscriptListLikeFetch ?? deps.listLikeWebFetch;
  if (transport == null || !deps.username || (!deps.userscriptListLikeFetch && !deps.session?.cookie)) return yield* new ProviderAuthError({ provider: 'letterboxd', refreshFailed: true });
  if (deps.username.toLowerCase() === params.owner.toLowerCase()) return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'You cannot like your own list.' });
  const response = yield* Effect.tryPromise({
    try: () => transport({ listPath: url.slice(LETTERBOXD_BASE_URL.length), username: deps.username!, liked: params.liked }),
    catch: (cause) => new ProviderNetworkError({ provider: 'letterboxd', cause }),
  });
  if (response.status === 401 || response.status === 403) return yield* new ProviderAuthError({ provider: 'letterboxd', refreshFailed: true });
  if (response.status === 429) return yield* new ProviderRateLimitError({ provider: 'letterboxd' });
  if (response.status < 200 || response.status >= 300) return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: response.status === 0 ? response.body : `Letterboxd responded ${response.status}. Check the list before retrying.` });
  const receipt = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Struct({ result: Schema.Boolean, liked: Schema.Boolean })))(response.body).pipe(
    Effect.mapError(() => new ProviderDecodeError({ provider: 'letterboxd', detail: 'No confirmed like receipt. Check Letterboxd before retrying.' })),
  );
  if (!receipt.result || receipt.liked !== params.liked) return yield* new ProviderDecodeError({ provider: 'letterboxd', detail: 'Letterboxd did not confirm the requested like state.' });
  return receipt.liked;
});
