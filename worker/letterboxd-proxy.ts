import {
  LETTERBOXD_BASE_URL,
  LETTERBOXD_WEB_PROXY_BASE_URL,
} from '@/lib/providers/letterboxd/config';

/**
 * Approved same-origin relay for allowlisted public Letterboxd reads. GET only, with no client
 * headers or cookies, no redirects, and no CORS headers. Serve only approved HTML or RSS with
 * a restrictive CSP. Store and log nothing. Writes stay in authenticated clients
 * (native WebView or web userscript).
 */

const PROXY_PREFIX = `${LETTERBOXD_WEB_PROXY_BASE_URL}/`;
const UPSTREAM_TIMEOUT_MS = 30_000;

/**
 * Attached server-side so the relayed request isn't UA-less — the cheapest
 * bot-heuristic tripwire for a datacenter GET. One fixed value, NOT the
 * client's header: this relay forwards nothing the caller sent.
 */
const RELAY_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * Letterboxd usernames are letters/digits/underscore/hyphen (the connect form
 * validates the same charset). First-match-wins; GET-only — any other method
 * on a matched path is a 405, anything unmatched is a 404 (KTD3 pattern).
 */
const RULES: Array<{ match: (path: string) => boolean }> = [
  // Exact poster recovery from Movie JSON-LD (plan 0066), never AJAX or artwork.
  { match: (p) => /^film\/(?=.{1,200}\/$)[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(p) },
  // Exact public identities and member watch records, never authenticated AJAX.
  { match: (p) => /^tmdb\/[1-9][0-9]{0,14}\/$/.test(p) },
  {
    match: (p) => /^[A-Za-z0-9_-]{1,39}\/film\/(?=.{1,200}\/$)[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(p),
  },
  // A public watchlist also permits the same path with a page/N suffix.
  { match: (p) => /^[A-Za-z0-9_-]{1,39}\/watchlist\/(page\/[1-9][0-9]{0,3}\/)?$/.test(p) },
  { match: (p) => /^[A-Za-z0-9_-]{1,39}\/rss\/$/.test(p) },
  // The public tags index supplies tag suggestions. Deeper diary HTML is
  // Cloudflare-challenged.
  { match: (p) => /^[A-Za-z0-9_-]{1,39}\/tags\/$/.test(p) },
  // Public list reads (plan 0061); the explicit liked page-1 URL avoids the
  // challenged bare URL. No filtered/detail/edit/likes or API subpaths.
  { match: (p) => /^[A-Za-z0-9_-]{1,39}\/lists\/(page\/[1-9][0-9]{0,3}\/)?$/.test(p) },
  { match: (p) => /^[A-Za-z0-9_-]{1,39}\/likes\/lists\/page\/[1-9][0-9]{0,3}\/$/.test(p) },
  {
    match: (p) =>
      /^[A-Za-z0-9_-]{1,39}\/list\/[a-z0-9-]{1,200}\/(page\/[1-9][0-9]{0,3}\/)?$/.test(p),
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

/** The only upstream body kinds this relay serves — the read surface is HTML pages and RSS. */
const RELAYABLE_CONTENT_TYPES = [
  'text/html',
  'application/rss+xml',
  'application/atom+xml',
  'text/xml',
  'application/xml',
];

function jsonResponse(status: number, payload: string): Response {
  return new Response(payload, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      // Deliberately NO Access-Control-Allow-Origin: same-origin needs none,
      // and its absence stops any foreign site's browser from using this relay
      // as a CORS bypass.
    },
  });
}

function jsonError(status: number, message: string): Response {
  return jsonResponse(status, JSON.stringify({ error: message }));
}

/**
 * Relay an upstream HTML/XML body. Unlike the Serializd JSON relay, serving
 * this markup IS the point (the client scrapes it) — so the response carries a
 * CSP that neutralizes every script/style/form/navigation vector if a browser
 * ever renders the URL directly: the app's own origin holds OAuth tokens in
 * localStorage (MMKV web fallback), and a rendered Letterboxd page must never
 * execute under it. `fetch().text()` consumers are unaffected by CSP.
 */
function relayResponse(status: number, contentType: string, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      // No Access-Control-Allow-Origin (see jsonResponse).
    },
  });
}

/** The spike-proven challenge signals: HTTP 403 + `<title>Just a moment...</title>`. */
function isCloudflareChallenge(status: number, body: string): boolean {
  return status === 403 && body.includes('Just a moment');
}

export function isLetterboxdProxyRequest(url: URL): boolean {
  return url.pathname.startsWith(PROXY_PREFIX);
}

/** Relay an allowlisted public read through the Worker. */
export async function handleLetterboxdProxy(
  request: Request,
  upstreamFetch: (input: string, init?: RequestInit) => Promise<Response> = globalThis.fetch,
): Promise<Response> {
  const url = new URL(request.url);
  const subPath = url.pathname.slice(PROXY_PREFIX.length);

  if (isUnsafePath(subPath)) return jsonError(404, 'not found');

  const rule = RULES.find((entry) => entry.match(subPath));
  if (rule == null) return jsonError(404, 'not found');
  if (request.method.toUpperCase() !== 'GET') {
    return jsonError(405, 'method not allowed');
  }

  // Forward NOTHING the client sent — these reads are public and
  // unauthenticated, so no Cookie/Authorization passthrough exists here at all
  // (contrast with the Serializd relay's Authorization-only rule). `Set-Cookie`
  // never comes back either: relayResponse builds fresh headers.
  const upstreamUrl = `${LETTERBOXD_BASE_URL}/${subPath}${url.search}`;

  let upstream: Response;
  try {
    upstream = await upstreamFetch(upstreamUrl, {
      method: 'GET',
      headers: { 'User-Agent': RELAY_USER_AGENT },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return jsonError(504, 'upstream unavailable');
  }

  const contentType = (upstream.headers.get('content-type') ?? '').split(';')[0].trim();
  const text = await upstream.text();

  // A Cloudflare challenge is `text/html` too — detect it explicitly so the
  // client gets a clean signal instead of unparseable markup.
  if (isCloudflareChallenge(upstream.status, text)) {
    return jsonError(502, 'upstream challenged');
  }
  if (!RELAYABLE_CONTENT_TYPES.includes(contentType)) {
    // Never relay an unexpected foreign body verbatim under the app origin.
    return jsonError(502, 'upstream error');
  }
  return relayResponse(upstream.status, upstream.headers.get('content-type') ?? contentType, text);
}
