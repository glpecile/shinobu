import { LETTERBOXD_BASE_URL } from '@/lib/providers/letterboxd/config';
import { SERIALIZD_APP_HEADERS, SERIALIZD_UPSTREAM_BASE_URL } from '@/lib/providers/serializd/config';
import { SIMKL_API_BASE_URL } from '@/lib/providers/simkl/config';
import { TMDB_API_BASE_URL, tmdbImageUrl } from '@/lib/providers/tmdb/config';

/**
 * Link previews for the web app (plan 0118), after Bluesky's bskyweb +
 * bskyogcard split: the static export has one HTML shell per dynamic route, so
 * the Worker injects per-item Open Graph tags into that shell and renders the
 * card PNG at `/og/<page path>.png`. Only public metadata is read, by id parsed
 * against the allowlist below, never a user's session.
 */

export interface Card {
  title: string;
  eyebrow?: string;
  description?: string;
  /** Portrait posters or profile photos; one for an item, up to four for a list. */
  posters: string[];
  /** A landscape image for a card without posters, such as a Letterboxd list's collage. */
  backdrop?: string;
}

export interface OgEnv {
  // Named like the app's build vars so `wrangler dev` reads them from .env.local.
  EXPO_PUBLIC_TMDB_TOKEN?: string;
  EXPO_PUBLIC_SIMKL_CLIENT_ID?: string;
}

type MediaProvider = 'tmdb' | 'serializd' | 'imdb' | 'anilist' | 'simkl' | 'letterboxd' | 'trakt';

export type CardSource =
  | { kind: 'media'; provider: MediaProvider; id: string; episode?: string }
  | { kind: 'person'; provider: 'tmdb' | 'anilist'; id: string }
  | { kind: 'studio'; id: string }
  | { kind: 'name'; eyebrow: 'Person' | 'Studio'; name: string }
  | { kind: 'letterboxdList'; owner: string; slug: string }
  | { kind: 'serializdList'; id: string };

// anilist/http.ts would pull Effect into the Worker for one constant.
const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';
const NUMBER = /^[1-9][0-9]{0,14}$/;
const SLUG = /^(?=.{1,200}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MEDIA_ID: Record<MediaProvider, RegExp> = {
  tmdb: /^(?:movie|tv)-[1-9][0-9]{0,14}$/,
  serializd: NUMBER,
  imdb: /^tt[0-9]{1,12}$/,
  anilist: NUMBER,
  simkl: NUMBER,
  letterboxd: SLUG,
  trakt: NUMBER,
};

function mediaSource(provider: string | undefined, id: string | undefined, episode?: string): CardSource | null {
  if (provider == null || id == null || !Object.hasOwn(MEDIA_ID, provider)) return null;
  const typed = provider as MediaProvider;
  return MEDIA_ID[typed].test(id) ? { kind: 'media', provider: typed, id, ...(episode ? { episode } : {}) } : null;
}

function nameSource(eyebrow: 'Person' | 'Studio', name: string | undefined): CardSource | null {
  const trimmed = name?.trim() ?? '';
  return trimmed !== '' && trimmed.length <= 200 ? { kind: 'name', eyebrow, name: trimmed } : null;
}

/** Which app route a path is, mirroring `routes.*` in src/lib/routes.ts; null keeps the 404. */
export function parseCardPath(pathname: string): CardSource | null {
  let parts: string[];
  try {
    parts = pathname.split('/').slice(1).map(decodeURIComponent);
  } catch {
    return null;
  }
  const [root, a, b, c, d] = parts;
  switch (root) {
    case 'details':
      return parts.length <= 4 ? mediaSource(a, b) : null;
    case 'episode': {
      const numbers = parts.slice(3);
      if (numbers.length === 0 || numbers.length > 2 || !numbers.every((n) => /^[0-9]{1,4}$/.test(n))) return null;
      return mediaSource(a, b, numbers.length === 2 ? `Season ${c} · Episode ${d}` : `Episode ${c}`);
    }
    case 'person':
      if (parts.length !== 3) return null;
      if (a === 'lookup') return nameSource('Person', b);
      return (a === 'tmdb' || a === 'anilist') && NUMBER.test(b) ? { kind: 'person', provider: a, id: b } : null;
    case 'studio':
      if (parts.length !== 3) return null;
      if (a === 'lookup') return nameSource('Studio', b);
      return a === 'tmdb' && NUMBER.test(b) ? { kind: 'studio', id: b } : null;
    case 'lists':
      if (a === 'serializd' && parts.length === 3 && NUMBER.test(b)) return { kind: 'serializdList', id: b };
      if (a === 'letterboxd' && parts.length === 4 && /^[A-Za-z0-9_-]{1,39}$/.test(b) && /^[a-z0-9-]{1,200}$/.test(c)) {
        return { kind: 'letterboxdList', owner: b, slug: c };
      }
      return null;
    default:
      return null;
  }
}

async function read<T>(url: string, init: RequestInit, as: 'json' | 'text'): Promise<T | null> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return null;
    return (as === 'json' ? await response.json() : await response.text()) as T;
  } catch {
    return null;
  }
}

function tmdb<T>(env: OgEnv, path: string): Promise<T | null> {
  const token = env.EXPO_PUBLIC_TMDB_TOKEN;
  if (!token) return Promise.resolve(null);
  return read<T>(`${TMDB_API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } }, 'json');
}

async function anilist<T>(query: string, id: string): Promise<T | null> {
  const body = JSON.stringify({ query, variables: { id: Number(id) } });
  const result = await read<{ data?: T }>(
    ANILIST_GRAPHQL_URL,
    { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body },
    'json',
  );
  return result?.data ?? null;
}

const compact = (values: Array<string | number | null | undefined>) => values.filter((v) => v != null && v !== '');
const join = (values: Array<string | number | null | undefined>) => compact(values).join(' · ') || undefined;
/**
 * AniList descriptions mix HTML with markdown. Staff bios also open with
 * `__Label:__ value` facts, `__Heading__` lines, and `[Site](url) | …` link rows,
 * which a preview drops so only prose remains.
 */
const plainText = (text: string | null | undefined) =>
  text
    ?.replace(/~!.*?!~/gs, '')
    .split('\n')
    .filter((line) => !/^\s*(?:__|\*\*|#)/.test(line) && !/\]\(.*\|/.test(line))
    .join(' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/__|\*\*|~~/g, '')
    .replace(/\s+/g, ' ')
    .trim() || undefined;

interface TmdbMedia {
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
}

function tmdbMediaCard(raw: TmdbMedia, kind: 'movie' | 'tv'): Card {
  return {
    title: raw.title ?? raw.name ?? '',
    eyebrow: join([kind === 'movie' ? 'Movie' : 'TV', (raw.release_date ?? raw.first_air_date)?.slice(0, 4)]),
    description: raw.overview || undefined,
    posters: compact([tmdbImageUrl(raw.poster_path, 'w342')]) as string[],
  };
}

async function tmdbMedia(env: OgEnv, kind: 'movie' | 'tv', id: string): Promise<Card | null> {
  const raw = await tmdb<TmdbMedia>(env, `/${kind}/${id}`);
  return raw ? tmdbMediaCard(raw, kind) : null;
}

const decodeEntities = (text: string) =>
  text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|quot|lt|gt|apos));/gi, (_, dec, hex, named: string | undefined) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return { amp: '&', quot: '"', lt: '<', gt: '>', apos: "'" }[named!.toLowerCase()] ?? '';
  });

async function letterboxdHtml(path: string): Promise<{ html: string; og: (key: string) => string | undefined } | null> {
  const html = await read<string>(`${LETTERBOXD_BASE_URL}/${path}/`, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 'text');
  if (html == null) return null;
  const og = (key: string) => {
    const match = html.match(new RegExp(`<meta property="og:${key}" content="([^"]*)"`));
    return match ? decodeEntities(match[1]).replace(/‎/g, '').replace(/\s+/g, ' ').trim() : undefined;
  };
  return { html, og };
}

/** Letterboxd has no API; a film page's OG tags hold "Title (Year)", and its JSON-LD the poster. */
async function letterboxdFilm(slug: string): Promise<Card | null> {
  const page = await letterboxdHtml(`film/${slug}`);
  const ogTitle = page?.og('title');
  if (page == null || ogTitle == null) return null;
  const [, title = ogTitle, year] = ogTitle.match(/^(.*) \((\d{4})\)$/) ?? [];
  const poster = page.html.match(/"image":"(https:\/\/a\.ltrbxd\.com\/resized\/film-poster\/[^"]+)"/)?.[1];
  return { title, eyebrow: join(['Movie', year]), description: page.og('description'), posters: poster ? [poster] : [] };
}

/** A list page's OG image is Letterboxd's own poster collage. */
async function letterboxdList(owner: string, slug: string): Promise<Card | null> {
  const page = await letterboxdHtml(`${owner}/list/${slug}`);
  const title = page?.og('title');
  return page && title
    ? { title, eyebrow: 'Letterboxd list', description: page.og('description'), posters: [], backdrop: page.og('image') }
    : null;
}

async function resolveMedia(env: OgEnv, provider: MediaProvider, id: string): Promise<Card | null> {
  switch (provider) {
    case 'tmdb': {
      const [kind, tmdbId] = id.split('-') as ['movie' | 'tv', string];
      return tmdbMedia(env, kind, tmdbId);
    }
    case 'serializd':
      return tmdbMedia(env, 'tv', id);
    case 'imdb': {
      const found = await tmdb<{ movie_results: TmdbMedia[]; tv_results: TmdbMedia[] }>(env, `/find/${id}?external_source=imdb_id`);
      if (found?.movie_results[0]) return tmdbMediaCard(found.movie_results[0], 'movie');
      return found?.tv_results[0] ? tmdbMediaCard(found.tv_results[0], 'tv') : null;
    }
    case 'anilist': {
      const data = await anilist<{
        Media: {
          title: { english: string | null; romaji: string | null };
          format: string | null;
          startDate: { year: number | null };
          description: string | null;
          coverImage: { extraLarge: string | null };
        } | null;
      }>(
        'query($id:Int){Media(id:$id){title{english romaji}format startDate{year}description(asHtml:false)coverImage{extraLarge}}}',
        id,
      );
      const media = data?.Media;
      if (!media) return null;
      return {
        title: media.title.english ?? media.title.romaji ?? '',
        eyebrow: join([media.format?.replace(/_/g, ' '), media.startDate.year]),
        description: plainText(media.description),
        posters: compact([media.coverImage.extraLarge]) as string[],
      };
    }
    case 'simkl': {
      const clientId = env.EXPO_PUBLIC_SIMKL_CLIENT_ID;
      if (!clientId) return null;
      const [hit] = (await read<Array<{ type: string; title: string; poster?: string; year?: number }>>(
        `${SIMKL_API_BASE_URL}/search/id?simkl=${id}&client_id=${encodeURIComponent(clientId)}`,
        {},
        'json',
      )) ?? [];
      if (!hit) return null;
      return {
        title: hit.title,
        eyebrow: join([hit.type === 'movie' ? 'Movie' : hit.type === 'anime' ? 'Anime' : 'TV', hit.year]),
        posters: hit.poster ? [`https://simkl.in/posters/${hit.poster}_m.jpg`] : [],
      };
    }
    case 'letterboxd':
      return letterboxdFilm(id);
    case 'trakt':
      // Trakt reads need the user's own client id, which only their browser holds.
      return null;
  }
}

export async function resolveCard(source: CardSource, env: OgEnv): Promise<Card | null> {
  switch (source.kind) {
    case 'media': {
      const card = await resolveMedia(env, source.provider, source.id);
      return card && source.episode ? { ...card, eyebrow: source.episode } : card;
    }
    case 'person': {
      if (source.provider === 'tmdb') {
        const raw = await tmdb<{ name: string; biography?: string; profile_path?: string | null; known_for_department?: string }>(
          env,
          `/person/${source.id}`,
        );
        if (!raw) return null;
        return {
          title: raw.name,
          eyebrow: raw.known_for_department || 'Person',
          description: raw.biography || undefined,
          posters: compact([tmdbImageUrl(raw.profile_path, 'w342')]) as string[],
        };
      }
      const data = await anilist<{
        Staff: { name: { full: string }; description: string | null; image: { large: string | null }; primaryOccupations: string[] } | null;
      }>('query($id:Int){Staff(id:$id){name{full}description(asHtml:false)image{large}primaryOccupations}}', source.id);
      if (!data?.Staff) return null;
      return {
        title: data.Staff.name.full,
        eyebrow: data.Staff.primaryOccupations.slice(0, 2).join(' · ') || 'Person',
        description: plainText(data.Staff.description),
        posters: compact([data.Staff.image.large]) as string[],
      };
    }
    case 'studio': {
      const raw = await tmdb<{ name: string; description?: string }>(env, `/company/${source.id}`);
      return raw ? { title: raw.name, eyebrow: 'Studio', description: raw.description || undefined, posters: [] } : null;
    }
    case 'name':
      return { title: source.name, eyebrow: source.eyebrow, posters: [] };
    case 'letterboxdList':
      return letterboxdList(source.owner, source.slug);
    case 'serializdList': {
      const raw = await read<{
        listName: string;
        listDescription?: string | null;
        owner: { username: string };
        numberOfItems: number;
        listItems: Array<{ bannerImage?: string | null; season?: { posterPath?: string | null } | null }>;
      }>(`${SERIALIZD_UPSTREAM_BASE_URL}/list/${source.id}`, { headers: SERIALIZD_APP_HEADERS }, 'json');
      if (!raw) return null;
      return {
        title: raw.listName,
        eyebrow: join(['Serializd list', `${raw.numberOfItems} ${raw.numberOfItems === 1 ? 'show' : 'shows'}`, `by ${raw.owner.username}`]),
        description: raw.listDescription || undefined,
        posters: raw.listItems
          .map((item) => tmdbImageUrl(item.season?.posterPath || item.bannerImage, 'w342'))
          .filter(Boolean)
          .slice(0, 4),
      };
    }
  }
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The head tags for one page; `+html.tsx` holds the site-wide defaults these replace. */
export function cardMetaTags(card: Card, url: URL): string {
  const description = card.description ?? card.eyebrow ?? '';
  const short = description.length > 300 ? `${description.slice(0, 297).trimEnd()}…` : description;
  const tags: Array<[string, string, string]> = [
    ['property', 'og:site_name', 'Shinobu'],
    ['property', 'og:type', 'website'],
    ['property', 'og:url', `${url.origin}${url.pathname}`],
    ['property', 'og:title', card.title],
    ['property', 'og:description', short],
    ['name', 'description', short],
    ['property', 'og:image', `${url.origin}/og${url.pathname}.png`],
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '630'],
    ['name', 'twitter:card', 'summary_large_image'],
  ];
  return [
    `<title>${escapeHtml(`${card.title} — Shinobu`)}</title>`,
    ...tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`),
  ].join('');
}

/** Resolved metadata for a page, cached a day so a preview and its image share one upstream read. */
export async function cachedCard(source: CardSource, url: URL, env: OgEnv, ctx: ExecutionContext): Promise<Card | null> {
  const key = new Request(`${url.origin}/og-card${url.pathname}`);
  const hit = await caches.default.match(key);
  if (hit) return hit.json();
  const card = await resolveCard(source, env);
  if (card) ctx.waitUntil(caches.default.put(key, Response.json(card, { headers: { 'Cache-Control': 'public, max-age=86400' } })));
  return card;
}

/**
 * A dynamic route's shell comes back from the assets router as the 404 page,
 * which crawlers skip; a recognized route is served with 200 and its own tags.
 */
export async function withPageMeta(request: Request, page: Response, env: OgEnv, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const source = page.status === 404 && (request.method === 'GET' || request.method === 'HEAD') ? parseCardPath(url.pathname) : null;
  if (source == null) return page;
  const found = new Response(page.body, { status: 200, headers: page.headers });
  const card = await cachedCard(source, url, env, ctx);
  if (card == null) return found;
  return new HTMLRewriter()
    .on('title, meta[property^="og:"], meta[name^="twitter:"], meta[name="description"]', { element: (element) => { element.remove(); } })
    .on('head', { element: (element) => { element.append(cardMetaTags(card, url), { html: true }); } })
    .transform(found);
}
