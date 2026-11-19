// The slice of the Workers runtime the Worker uses that bun's types lack,
// without @cloudflare/workers-types replacing the globals the app checks against.

// Takumi declares the binary's raw exports. Wrangler imports the compiled module.
declare module '@takumi-rs/wasm/takumi_wasm_bg.wasm' {
  const module: WebAssembly.Module;
  export default module;
}

interface CacheStorage {
  readonly default: Cache;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
