// The slice of the Workers runtime the Worker uses that bun's types lack,
// without @cloudflare/workers-types replacing the globals the app checks against.

declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}

interface CacheStorage {
  readonly default: Cache;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
