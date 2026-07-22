import {
  handleLetterboxdProxy,
  isLetterboxdProxyRequest,
} from './letterboxd-proxy';
import {
  handleLetterboxdWriteSpike,
  isLetterboxdWriteSpikeRequest,
} from './letterboxd-write-spike';
import { handleSerializdProxy, isSerializdProxyRequest } from './serializd-proxy';

/**
 * Full-stack Worker entrypoint (plan 0017 KTD3): the `main` handler added to the
 * previously static-assets-only Worker (docs/solutions/cloudflare-workers-static-
 * web-deploy.md pre-plotted exactly this). Serializd + Letterboxd (plan 0018)
 * proxy requests are relayed; everything else falls through to unchanged
 * static-asset serving via the `ASSETS` binding — so the static export, custom
 * domain, and Workers Builds pipeline are untouched (no `web.output` flip).
 */
export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    const url = new URL(request.url);
    // The Letterboxd write spike lives under the /api/letterboxd/ prefix but is
    // a separate throwaway relay — check it before the reads allowlist (which
    // would 404 its path).
    if (isLetterboxdWriteSpikeRequest(url)) {
      return handleLetterboxdWriteSpike(request);
    }
    if (isSerializdProxyRequest(url)) {
      return handleSerializdProxy(request);
    }
    if (isLetterboxdProxyRequest(url)) {
      return handleLetterboxdProxy(request);
    }
    return env.ASSETS.fetch(request);
  },
};
