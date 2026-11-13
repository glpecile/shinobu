import { routes } from '@/lib/routes';

/** Only media pages, never provider sign-in, profiles, reviews or list pages. */
export function mediaLinkRoute(path: string): string | null {
  try {
    let url = new URL(path);
    if (url.protocol === 'shinobu:' && url.hostname === 'open') {
      url = new URL(url.searchParams.get('url') ?? '');
    }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) {
      return null;
    }
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'letterboxd.com') {
      const slug = /^\/film\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(url.pathname)?.[1];
      return slug == null ? null : routes.details(`letterboxd-${slug}`);
    }
    if (host === 'imdb.com' || host === 'm.imdb.com') {
      const imdb = /^\/title\/(tt[0-9]+)\/?$/.exec(url.pathname)?.[1];
      return imdb == null ? null : routes.details(`imdb-${imdb}`);
    }
    if (host === 'anilist.co') {
      const id = /^\/(?:anime|manga)\/([1-9][0-9]*)(?:\/[^/]+)?\/?$/.exec(url.pathname)?.[1];
      if (id == null || !Number.isSafeInteger(Number(id))) return null;
      return routes.details(`anilist-${id}`, url.pathname.startsWith('/manga/') ? 'MANGA' : undefined);
    }
    if (host === 'hardcover.app') {
      const slug = /^\/books\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(url.pathname)?.[1];
      return slug == null ? null : routes.details(`hardcover-books-${slug}`);
    }
    return null;
  } catch {
    return null;
  }
}

/** The slug behind a `hardcover-books-<slug>` id that `mediaLinkRoute` mints, or null. */
export function parseHardcoverSlugItemId(id: string): string | null {
  return /^hardcover-books-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(id)?.[1] ?? null;
}

/** A failed incoming lookup stays escapable without redispatching an OS intent. */
export function mediaLinkUrl(id: string, mediaType?: string): string | null {
  const slug = /^letterboxd-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(id)?.[1];
  if (slug != null) return `https://letterboxd.com/film/${slug}/`;
  const imdb = /^imdb-(tt[0-9]+)$/.exec(id)?.[1];
  if (imdb != null) return `https://www.imdb.com/title/${imdb}/`;
  const serializd = /^serializd-([1-9][0-9]*)$/.exec(id)?.[1];
  if (serializd != null) return `https://serializd.com/show/${serializd}`;
  const hardcoverSlug = parseHardcoverSlugItemId(id);
  if (hardcoverSlug != null) return `https://hardcover.app/books/${hardcoverSlug}`;
  const hardcover = /^hardcover-([1-9][0-9]*)$/.exec(id)?.[1];
  if (hardcover != null) return `https://hardcover.app/id/book/${hardcover}`;
  const anilist = /^anilist-([1-9][0-9]*)$/.exec(id)?.[1];
  return anilist == null ? null : `https://anilist.co/${mediaType === 'MANGA' ? 'manga' : 'anime'}/${anilist}`;
}
