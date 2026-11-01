/**
 * Explicitly approved fourth proxy exception (2026-11-01): the logged-out Atom
 * search feed of r/anime, r/movies and r/television only. GET with exactly one
 * `q` parameter; the Worker fixes the other search parameters itself. No client
 * headers, redirects, cookies, CORS headers, JSON API, comments, media, writes,
 * or logging. Only an Atom feed is served under the app origin, with nosniff
 * and a locked CSP. Upstream latency is bounded; successful reads cache for ten
 * minutes. See docs/solutions/reddit-logged-out-json-blocked.md.
 */
export function isRedditProxyRequest(url: URL): boolean {
  return url.pathname.startsWith('/api/reddit/');
}

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, {
    status,
    headers: { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' },
  });
}

export async function handleRedditProxy(
  request: Request,
  upstreamFetch: (input: string, init?: RequestInit) => Promise<Response> = globalThis.fetch,
): Promise<Response> {
  const url = new URL(request.url);
  const subreddit = /^\/api\/reddit\/(anime|movies|television)\/search\.rss$/.exec(url.pathname)?.[1];
  const q = url.searchParams.get('q');
  if (subreddit == null || [...url.searchParams.keys()].join() !== 'q' || q == null || q.trim() === '' || q.length > 200) {
    return jsonError(404, 'not found');
  }
  if (request.method !== 'GET') return jsonError(405, 'method not allowed');

  let upstream: Response;
  try {
    // ponytail: every user shares the Worker's egress budget (~1 search/min/IP);
    // put a caches.default lookup in front if 429s show up in production.
    upstream = await upstreamFetch(
      `https://www.reddit.com/r/${subreddit}/search.rss?q=${encodeURIComponent(q)}&restrict_sr=on&sort=new&limit=25`,
      {
        method: 'GET',
        // Reddit asks API clients for a descriptive User-Agent; it is fixed, never the caller's.
        headers: { 'User-Agent': 'web:shinobu:1.0 (discussion search)' },
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    return jsonError(504, 'upstream unavailable');
  }
  if (!upstream.ok || upstream.headers.get('content-type')?.split(';')[0].trim() !== 'application/atom+xml') {
    return jsonError(502, 'upstream error');
  }
  const feed = await upstream.text().catch(() => '');
  if (!feed.includes('<feed')) return jsonError(502, 'invalid upstream feed');
  return new Response(feed, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      'Cache-Control': 'public, max-age=600',
    },
  });
}
