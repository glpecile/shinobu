import { handleSerializdProxy, isSerializdProxyRequest } from './serializd-proxy';

/**
 * Full-stack Worker entrypoint (plan 0017 KTD3): the `main` handler added to the
 * previously static-assets-only Worker (docs/solutions/cloudflare-workers-static-
 * web-deploy.md pre-plotted exactly this). Serializd proxy requests are relayed;
 * everything else falls through to unchanged static-asset serving via the
 * `ASSETS` binding — so the static export, custom domain, and Workers Builds
 * pipeline are untouched (no `web.output` flip).
 */
export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    const url = new URL(request.url);
    if (isSerializdProxyRequest(url)) {
      return handleSerializdProxy(request);
    }
    return env.ASSETS.fetch(request);
  },
};
