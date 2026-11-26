import {
  SERIALIZD_APP_HEADERS,
  SERIALIZD_UPSTREAM_BASE_URL,
  SERIALIZD_WEB_PROXY_BASE_URL,
} from '@/lib/providers/serializd/config';

/**
 * Approved same-origin relay for exact Serializd paths and methods. Only Authorization crosses
 * from the client. Keep upstream responses JSON, omit CORS, and never log requests or
 * credentials.
 */

const PROXY_PREFIX = `${SERIALIZD_WEB_PROXY_BASE_URL}/`;
const MAX_BODY_BYTES = 64 * 1024;
// The full editor retains up to 500 rich entries, including their notes.
const MAX_LIST_EDIT_BYTES = 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;

type Method = 'GET' | 'POST';
type UpstreamFetch = (input: string, init?: RequestInit) => Promise<Response>;

// One encoded path segment: no raw or encoded slash/backslash, never "." or "..".
const SEGMENT = String.raw`(?:[A-Za-z0-9_.~-]|%(?!2[Ff]|5[Cc]|2[Ee])[0-9A-Fa-f]{2})+`;
const ID = '[1-9][0-9]{0,14}';

function exact(pattern: string): (path: string) => boolean {
  const regex = new RegExp(`^${pattern}$`);
  return (path) => regex.test(path);
}

/** First match wins. Each exact path specifies one method and any allowed query keys. */
const RULES: Array<{
  match: (path: string) => boolean;
  method: Method;
  query?: readonly string[];
}> = [
  { match: (p) => p === 'login', method: 'POST' },
  { match: (p) => p === 'validateauthtoken', method: 'POST' },
  { match: (p) => p === 'watched_v2', method: 'POST' },
  { match: (p) => p === 'watched/remove_v2', method: 'POST' },
  { match: (p) => p === 'show/reviews/add', method: 'POST' },
  { match: (p) => p === 'episode_log/add' || p === 'episode_log/remove', method: 'POST' },
  // Watchlist (plan 0031 / plan 0017 amendment). Exact matches, POST-only:
  // Serializd itself answers 405 to GET/PUT/DELETE on watchlist_v2, so the
  // single-method rule mirrors upstream rather than narrowing it.
  { match: (p) => p === 'watchlist_v2', method: 'POST' },
  { match: (p) => p === 'watchlist/remove_v2', method: 'POST' },
  { match: exact('(?:paused_shows|dropped_shows|currently_watching)(?:/remove)?'), method: 'POST' },
  {
    match: (p) => p === 'list/add_item' || p === 'list/edit' || p === 'list/create',
    method: 'POST',
  },
  { match: (p) => /^list\/[1-9][0-9]{0,14}$/.test(p), method: 'GET' },
  // Coming Soon (plan 0114). Exact match: `search/` holds user search too.
  { match: (p) => p === 'search/upcoming_episodes_v3', method: 'GET' },
  { match: exact(`show/${ID}`), method: 'GET' },
  // Season 0 is specials.
  { match: exact(`show/${ID}/season/(?:0|${ID})`), method: 'GET' },
  { match: exact(`user/${SEGMENT}/diary`), method: 'GET', query: ['page'] },
  {
    match: exact(`user/${SEGMENT}/(?:lists|liked_lists)`),
    method: 'GET',
    query: ['sort_by', 'page'],
  },
  { match: exact(`user/${SEGMENT}/show/${ID}/progress`), method: 'GET' },
  {
    match: exact(
      `user/${SEGMENT}/(?:watchedpage_v2|currently_watching_page|paused_shows_page|dropped_shows_page)/${ID}`,
    ),
    method: 'GET',
    query: ['sort_by'],
  },
];

/** Reject traversal, protocol-relative, and absolute-URL sub-paths outright. */
function isUnsafePath(path: string): boolean {
  return (
    path === '' ||
    path.includes('..') ||
    path.includes('//') ||
    path.includes('\\') ||
    /^[a-z]+:/i.test(path)
  );
}

function jsonResponse(status: number, payload: string): Response {
  return new Response(payload, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      // Deliberately NO Access-Control-Allow-Origin: same-origin needs none,
      // and its absence stops any foreign site's browser from using this relay
      // as a CORS bypass (R14).
    },
  });
}

function jsonError(status: number, message: string): Response {
  return jsonResponse(status, JSON.stringify({ error: message }));
}

export function isSerializdProxyRequest(url: URL): boolean {
  return url.pathname.startsWith(PROXY_PREFIX);
}

/** Relay an allowlisted Serializd request through the Worker. */
export async function handleSerializdProxy(
  request: Request,
  upstreamFetch: UpstreamFetch = globalThis.fetch,
): Promise<Response> {
  const url = new URL(request.url);
  const subPath = url.pathname.slice(PROXY_PREFIX.length);
  const method = request.method.toUpperCase();

  if (isUnsafePath(subPath)) return jsonError(404, 'not found');

  const rule = RULES.find((entry) => entry.match(subPath));
  if (rule == null) return jsonError(404, 'not found');
  if (rule.method !== method) return jsonError(405, 'method not allowed');
  const allowedQuery = rule.query ?? [];
  if ([...url.searchParams.keys()].some((key) => !allowedQuery.includes(key))) {
    return jsonError(400, 'query not allowed');
  }

  let body: ArrayBuffer | undefined;
  if (method === 'POST') {
    const limit = subPath === 'list/edit' ? MAX_LIST_EDIT_BYTES : MAX_BODY_BYTES;
    // Reject a declared oversize body unread; the byteLength check below still
    // runs because Content-Length can be absent or wrong.
    const declared = Number(request.headers.get('Content-Length') ?? NaN);
    if (Number.isFinite(declared) && declared > limit) return jsonError(413, 'request too large');
    body = await request.arrayBuffer();
    if (body.byteLength > limit) return jsonError(413, 'request too large');
  }

  // Forward ONLY Authorization — never the incoming Cookie or any other client
  // header. The app headers are attached here (the browser can't set them).
  const authorization = request.headers.get('Authorization');
  const headers: Record<string, string> = {
    ...SERIALIZD_APP_HEADERS,
    'Content-Type': 'application/json',
    ...(authorization != null ? { Authorization: authorization } : {}),
  };

  const upstreamUrl = `${SERIALIZD_UPSTREAM_BASE_URL}/${subPath}${url.search}`;

  let upstream: Response;
  try {
    upstream = await upstreamFetch(upstreamUrl, {
      method,
      headers,
      ...(body != null && body.byteLength > 0 ? { body } : {}),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    // Timeout / network failure. Never log the body or Authorization.
    return jsonError(504, 'upstream unavailable');
  }

  // Relay the status, but force JSON: a Render cold-start can serve an HTML 502
  // — never relay a foreign HTML body verbatim under the app origin (R14).
  const contentType = upstream.headers.get('content-type') ?? '';
  const text = await upstream.text();
  const payload =
    contentType.includes('application/json') && text !== ''
      ? text
      : JSON.stringify({ error: 'upstream error' });
  return jsonResponse(upstream.status, payload);
}
