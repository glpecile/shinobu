import { LETTERBOXD_BASE_URL } from '@/lib/providers/letterboxd/config';

/**
 * Letterboxd Workers-egress diagnostic (plan 0018, todos/011).
 * The Worker dispatches it separately from the GET-only public read relay.
 */

const SPIKE_PATH = '/api/letterboxd/spike/production-log-entries';
const UPSTREAM_URL = `${LETTERBOXD_BASE_URL}/api/v0/production-log-entries`;
const MAX_BODY_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;
const BODY_EXCERPT_BYTES = 500;

export function isLetterboxdWriteSpikeRequest(url: URL): boolean {
  return url.pathname === SPIKE_PATH;
}

function spikeResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      // No Access-Control-Allow-Origin, same as the production relays.
    },
  });
}

export async function handleLetterboxdWriteSpike(
  request: Request,
  upstreamFetch: (input: string, init?: RequestInit) => Promise<Response> = globalThis.fetch,
): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') {
    return spikeResponse(405, { error: 'method not allowed' });
  }

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BODY_BYTES) {
    return spikeResponse(413, { error: 'request too large' });
  }

  const headers: Record<string, string> = {
    'Content-Type': request.headers.get('Content-Type') ?? 'application/json',
    Origin: LETTERBOXD_BASE_URL,
    Referer: `${LETTERBOXD_BASE_URL}/`,
  };
  for (const name of ['Cookie', 'User-Agent', 'X-CSRF-TOKEN'] as const) {
    const value = request.headers.get(name);
    if (value != null) headers[name] = value;
  }

  let upstream: Response;
  try {
    upstream = await upstreamFetch(UPSTREAM_URL, {
      method: 'POST',
      headers,
      ...(body.byteLength > 0 ? { body } : {}),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return spikeResponse(504, { error: 'upstream unavailable' });
  }

  const excerpt = (await upstream.text()).slice(0, BODY_EXCERPT_BYTES);
  const challenged = upstream.status === 403 && excerpt.includes('Just a moment');
  return spikeResponse(upstream.status, {
    challenged,
    upstreamStatus: upstream.status,
    upstreamContentType: upstream.headers.get('content-type'),
    upstreamBodyExcerpt: excerpt,
  });
}
