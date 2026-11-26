const http = require('node:http');
const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const uniwindConfig = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
});

// Uniwind 1.13 swaps `react-native` for a re-export that lacks RN 0.88's
// `AssetRegistry`, so expo-asset (Android tab-icon fonts) gets undefined.
// (docs/solutions/uniwind-rn-088-missing-asset-registry.md)
const uniwindResolveRequest = uniwindConfig.resolver.resolveRequest;
uniwindConfig.resolver.resolveRequest = (context, moduleName, platform) =>
  platform !== 'web' &&
  moduleName === 'react-native' &&
  context.originModulePath.includes(`${path.sep}node_modules${path.sep}expo-asset${path.sep}`)
    ? context.resolveRequest(context, moduleName, platform)
    : uniwindResolveRequest(context, moduleName, platform);

const getTransformOptions = uniwindConfig.transformer.getTransformOptions;
uniwindConfig.transformer.getTransformOptions = async (...args) => {
  const options = await getTransformOptions(...args);
  return { ...options, transform: { ...options.transform, inlineRequires: true } };
};

// Metro has no Cloudflare Worker, so /api/* proxy routes 404 in web dev.
// Forward them to local `wrangler dev` (docs/solutions/local-web-dev-proxy-middleware.md).
const WORKER_DEV_ORIGIN = process.env.SHINOBU_WORKER_DEV_ORIGIN ?? 'http://localhost:8787';
const WORKER_PROXY_PREFIXES = [
  '/api/serializd/',
  '/api/letterboxd/',
  '/api/fourchan/',
  '/api/reddit/',
];

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
  proxyReq.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error:
          'Local worker unreachable — start it with `bun run dev:worker` alongside `bun web` for /api/* proxies in web dev.',
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
    return (req, res, next) => workerDevProxy(req, res, () => nextMiddleware(req, res, next));
  },
};

module.exports = uniwindConfig;
