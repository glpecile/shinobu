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

// Static-assets fallthrough keeps static export intact (docs/solutions/cloudflare-workers-static-web-deploy.md).
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
