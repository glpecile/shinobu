const http = require("node:http");

const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro"); // make sure this import exists

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Apply uniwind modifications before exporting
const uniwindConfig = withUniwindConfig(config, {
  // relative path to your global.css file
  cssEntryFile: "./src/global.css",
  // optional: path to typings
  dtsFile: "./src/uniwind-types.d.ts",
});

// --- Local worker proxy (web dev only) --------------------------------------
// `bun web` (Metro) has no Worker, so the same-origin proxy paths the web app
// depends on in production (`/api/serializd/*`, `/api/letterboxd/*`) 404 there
// — and the Letterboxd connect flow misreads that 404 as "username not found".
// In dev, forward those prefixes to a locally running `wrangler dev`
// (`bun run dev:worker`), which executes worker/index.ts exactly like
// production. This lives here (dev tooling) so it can never ship in a bundle;
// production routing is wrangler.jsonc's `run_worker_first`.
// (docs/solutions/local-web-dev-proxy-middleware.md)
const WORKER_DEV_ORIGIN =
  process.env.SHINOBU_WORKER_DEV_ORIGIN ?? "http://localhost:8787";
const WORKER_PROXY_PREFIXES = ["/api/serializd/", "/api/letterboxd/"];

/** Connect-style middleware: relay proxy prefixes to `wrangler dev`, else next(). */
function workerDevProxy(req, res, next) {
  if (!WORKER_PROXY_PREFIXES.some((prefix) => req.url?.startsWith(prefix))) {
    return next();
  }
  const target = new URL(req.url, WORKER_DEV_ORIGIN);
  const proxyReq = http.request(
    target,
    { method: req.method, headers: { ...req.headers, host: target.host } },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("error", () => {
    // `wrangler dev` isn't running — answer with a clean JSON 502 instead of
    // letting the SPA fallback's 404 masquerade as "username not found".
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error:
          "Local worker unreachable — start it with `bun run dev:worker` alongside `bun web` for /api/* proxies in web dev.",
      }),
    );
  });
  req.pipe(proxyReq);
}

// `enhanceMiddleware` runs inside Expo CLI's dev-server middleware stack ahead
// of the history fallback that would otherwise answer /api/* with a 404 page.
const previousEnhanceMiddleware = uniwindConfig.server?.enhanceMiddleware;
uniwindConfig.server = {
  ...uniwindConfig.server,
  enhanceMiddleware: (middleware, server) => {
    const nextMiddleware = previousEnhanceMiddleware
      ? previousEnhanceMiddleware(middleware, server)
      : middleware;
    return (req, res, next) =>
      workerDevProxy(req, res, () => nextMiddleware(req, res, next));
  },
};

module.exports = uniwindConfig;
