import {
  SERIALIZD_APP_HEADERS,
  SERIALIZD_UPSTREAM_BASE_URL,
  SERIALIZD_WEB_PROXY_BASE_URL,
} from '@/lib/providers/serializd/config';

/**
 * The Serializd same-origin CORS proxy (plan 0017 U4/R14, KTD3) — the repo's
 * first and deliberately bounded exception to the AGENTS.md "never proxied"
 * policy. It forwards ONLY an allowlisted set of Serializd path+method pairs,
 * attaches the app headers server-side, passes through only `Authorization`
 * (never cookies or any other client header), caps body size and upstream
 * latency, forces a JSON `Content-Type` + `nosniff` on every relayed response,
 * emits no `Access-Control-Allow-Origin`, and stores/logs nothing. Everything
 * else falls through to static-asset serving (worker/index.ts).
 *
 * Pure helpers (no Cloudflare bindings) so the security boundary is unit-tested.
 */

const PROXY_PREFIX = `${SERIALIZD_WEB_PROXY_BASE_URL}/`;
const MAX_BODY_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;

type Method = 'GET' | 'POST';
type UpstreamFetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * First-match-wins allowlist keyed on the sub-path (after `/api/serializd/`),
 * each with its single permitted method (KTD3). The explicit POST endpoints
 * precede the `show/`/`user/` GET prefixes so `show/reviews/add` binds to POST,
 * not the `show/` GET rule.
 */
const RULES: Array<{ match: (path: string) => boolean; method: Method }> = [
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
  { match: (p) => p.startsWith('show/'), method: 'GET' },
  { match: (p) => p.startsWith('user/'), method: 'GET' },
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

/** Is this request for the Serializd proxy (vs static assets)? */
export function isSerializdProxyRequest(url: URL): boolean {
  return url.pathname.startsWith(PROXY_PREFIX);
}

/**
 * Relay an allowlisted Serializd request. `upstreamFetch` is injectable so the
 * boundary is testable; production passes the Worker's global `fetch`.
 */
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

  let body: ArrayBuffer | undefined;
  if (method === 'POST') {
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return jsonError(413, 'request too large');
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
