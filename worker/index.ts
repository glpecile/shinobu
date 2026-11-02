import {
  handleLetterboxdProxy,
  isLetterboxdProxyRequest,
} from './letterboxd-proxy';
import {
  handleLetterboxdWriteSpike,
  isLetterboxdWriteSpikeRequest,
} from './letterboxd-write-spike';
import { handleSerializdProxy, isSerializdProxyRequest } from './serializd-proxy';
import { handleFourchanProxy, isFourchanProxyRequest } from './fourchan-proxy';
import { handleRedditProxy, isRedditProxyRequest } from './reddit-proxy';
import { withPageMeta, type OgEnv } from './og';
import { handleOgImage, isOgImageRequest } from './og-image';

/**
 * Full-stack Worker entrypoint (plan 0017 KTD3): the `main` handler added to the
 * previously static-assets-only Worker (docs/solutions/cloudflare-workers-static-
 * web-deploy.md pre-plotted exactly this). Serializd, Letterboxd (plan 0018),
 * public 4chan catalogs (plan 0064), and Reddit search feeds
 * proxy requests are relayed, `/og/*` renders link-preview cards and dynamic
 * routes get their Open Graph tags (plan 0118); everything else falls through to
 * unchanged static-asset serving via the `ASSETS` binding — so the static
 * export, custom domain, and Workers Builds pipeline are untouched (no
 * `web.output` flip).
 */
export interface Env extends OgEnv {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (isFourchanProxyRequest(url)) {
      return handleFourchanProxy(request);
    }
    if (isRedditProxyRequest(url)) {
      return handleRedditProxy(request);
    }
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
    if (isOgImageRequest(url)) {
      return handleOgImage(request, env, ctx);
    }
    return withPageMeta(request, await env.ASSETS.fetch(request), env, ctx);
  },
};
