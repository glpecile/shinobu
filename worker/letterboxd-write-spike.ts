import { LETTERBOXD_BASE_URL } from '@/lib/providers/letterboxd/config';

/**
 * THROWAWAY — plan 0018 phase-0 re-spike (todos/011), NOT production code.
 *
 * The 2026-07-20 spike proved every state-changing Letterboxd POST is 403
 * "Just a moment…"-challenged from server-side fetch (EAS Hosting/undici,
 * residential + datacenter IPs alike) — TLS/client fingerprinting. This route
 * re-runs exactly that test from **Workers egress**, whose TLS fingerprint is
 * Cloudflare's own and is the one transport the prior spike never tried.
 *
 * It replays ONE path — `POST /api/v0/production-log-entries` — forwarding the
 * caller's `Cookie` / `User-Agent` / `X-CSRF-TOKEN` verbatim (the caller IS the
 * session owner; same trust model as the native app holding the cookie) and
 * classifies the upstream response: challenged (403 + "Just a moment") vs
 * reached-Rails (anything else). Never logs Cookie/CSRF/body values.
 *
 * Delete this file after the verdict: either the write rule gets promoted into
 * worker/letterboxd-proxy.ts's allowlist (writes GO) or this was the final
 * confirmation that writes stay native-WebView-only.
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
  const challenged =
    upstream.status === 403 && excerpt.includes('Just a moment');
  return spikeResponse(upstream.status, {
    challenged,
    upstreamStatus: upstream.status,
    upstreamContentType: upstream.headers.get('content-type'),
    upstreamBodyExcerpt: excerpt,
  });
}
