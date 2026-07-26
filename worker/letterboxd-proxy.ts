import {
  LETTERBOXD_BASE_URL,
  LETTERBOXD_WEB_PROXY_BASE_URL,
} from '@/lib/providers/letterboxd/config';

/**
 * The Letterboxd same-origin reads proxy (plan 0018) — the repo's second
 * bounded exception to the AGENTS.md "never proxied" policy, modeled on
 * worker/serializd-proxy.ts. It forwards ONLY three public, unauthenticated
 * GET path shapes (`/{user}/watchlist/` with an optional `page/N/` suffix,
 * `/{user}/rss/`, and `/{user}/tags/` — the entire Letterboxd read surface),
 * attaches no client headers, caps upstream latency, relays only
 * HTML/XML bodies under a script-killing CSP + `nosniff`, maps the Cloudflare
 * challenge page to a clean 502, emits no `Access-Control-Allow-Origin`, and
 * stores/logs nothing. Everything else falls through to static-asset serving
 * (worker/index.ts).
 *
 * Why GET-only: every state-changing Letterboxd POST (log writes, sign-in) is
 * behind Cloudflare client/TLS fingerprinting that no server-side fetch can
 * fake (docs/solutions/letterboxd-web-proxy.md) — writes stay on the native
 * authenticated WebView. A POST rule may ONLY be added if the 2026-07-22
 * Workers-egress re-spike (worker/letterboxd-write-spike.ts) proves otherwise.
 *
 * Pure helpers (no Cloudflare bindings) so the security boundary is unit-tested.
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
  // The optional `page/N/` suffix (plan 0024 U9) is the ONE widening this rule
  // has taken: the watchlist grid pages past the first 28 films. Still one
  // username, still the watchlist path, still GET-only and unauthenticated —
  // `N` is bounded to 1–9999 so no unbounded path segment reaches upstream, and
  // `page/0/` (and any non-numeric suffix) stays a 404.
  { match: (p) => /^[A-Za-z0-9_-]{1,39}\/watchlist\/(page\/[1-9][0-9]{0,3}\/)?$/.test(p) },
  { match: (p) => /^[A-Za-z0-9_-]{1,39}\/rss\/$/.test(p) },
  // The member's public tag index — the vocabulary the log sheet's tag picker
  // suggests from. Spiked 2026-07-25 (`GET /{user}/tags/`, browser UA):
  // **200, ~69 KB, NOT Cloudflare-challenged**, unlike the deeper diary pages
  // in docs/solutions/letterboxd-diary-html-cloudflare-walled.md. Stays inside
  // the plan 0018 contract exactly as the two rules above do: one username, one
  // public page, GET-only, unauthenticated, no new headers. The trailing slash
  // is required, so the deeper filtered shapes (`/tags/films/by/name/`) stay
  // 404s — this rule never widens into the tag *browse* surface.
  { match: (p) => /^[A-Za-z0-9_-]{1,39}\/tags\/$/.test(p) },
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

/** Is this request for the Letterboxd proxy (vs static assets)? */
export function isLetterboxdProxyRequest(url: URL): boolean {
  return url.pathname.startsWith(PROXY_PREFIX);
}

/**
 * Relay an allowlisted Letterboxd read. `upstreamFetch` is injectable so the
 * boundary is testable; production passes the Worker's global `fetch`.
 */
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
    // Timeout / network failure. Nothing sensitive exists to log.
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
