/**
 * Explicitly approved third proxy exception (plan 0064): public GET catalogs
 * for /a/, /tv/, /co/ only. No query parameters, client headers, redirects,
 * cookies, CORS headers, thread/image/archive requests, writes, or logging.
 * Only valid JSON is served under the app origin, with nosniff and a locked
 * CSP. Upstream latency is bounded; successful public reads cache for a minute.
 */
export function isFourchanProxyRequest(url: URL): boolean {
  return url.pathname.startsWith('/api/fourchan/');
}

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, {
    status,
    headers: { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' },
  });
}

export async function handleFourchanProxy(
  request: Request,
  upstreamFetch: (input: string, init?: RequestInit) => Promise<Response> = globalThis.fetch,
): Promise<Response> {
  const url = new URL(request.url);
  const board = /^\/api\/fourchan\/(a|tv|co)\/catalog\.json$/.exec(url.pathname)?.[1];
  if (board == null || url.search !== '') return jsonError(404, 'not found');
  if (request.method !== 'GET') return jsonError(405, 'method not allowed');

  let upstream: Response;
  try {
    // The official API host answers Workers requests that the CDN host rate-limits.
    upstream = await upstreamFetch(`https://api.4chan.org/${board}/catalog.json`, {
      method: 'GET',
      // Workers supports manual/follow, not the browser's "error" redirect mode.
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return jsonError(504, 'upstream unavailable');
  }
  if (!upstream.ok || upstream.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return jsonError(502, 'upstream error');
  }
  try {
    return Response.json(await upstream.json(), {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch {
    return jsonError(502, 'invalid upstream JSON');
  }
}
