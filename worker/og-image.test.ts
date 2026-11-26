import { plugin } from 'bun';
import { expect, test } from 'bun:test';

test('the renderer recovers from a failed init, and repeated uncached renders stabilize WASM memory', async () => {
  let failInit = true;
  let memory: WebAssembly.Memory | undefined;
  const instantiate = WebAssembly.instantiate;
  const cacheDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  // Match Wrangler's precompiled WASM and Data font imports in Bun.
  plugin({
    name: 'og-assets',
    setup(build) {
      build.onLoad({ filter: /\.(ttf|wasm)$/ }, async ({ path }) => {
        const bytes = await Bun.file(path).arrayBuffer();
        return {
          exports: { default: path.endsWith('.wasm') ? new WebAssembly.Module(bytes) : bytes },
          loader: 'object',
        };
      });
    },
  });
  WebAssembly.instantiate = (async (
    module: BufferSource | WebAssembly.Module,
    imports?: WebAssembly.Imports,
  ) => {
    if (failInit) {
      failInit = false;
      throw new Error('transient instantiate failure');
    }
    const result: WebAssembly.Instance | WebAssembly.WebAssemblyInstantiatedSource =
      await Reflect.apply(instantiate, WebAssembly, [module, imports]);
    const instance = ('instance' in result ? result.instance : result) as WebAssembly.Instance;
    if (Object.hasOwn(instance.exports, 'renderer_render'))
      memory = instance.exports.memory as WebAssembly.Memory;
    return result;
  }) as typeof instantiate;
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { default: { match: async () => undefined, put: async () => {} } },
  });
  try {
    const { handleOgImage } = await import('./og-image');
    const env = { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } };
    const ctx = { waitUntil() {} };
    const render = async () => {
      const response = await handleOgImage(
        new Request('https://example.test/og/person/lookup/Probe.png'),
        env,
        ctx,
      );
      expect(response.status).toBe(200);
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(bytes.slice(0, 8)).toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    };
    await expect(render()).rejects.toThrow('transient instantiate failure');
    for (let i = 0; i < 5; i++) await render();
    if (!memory) throw new Error('renderer WASM memory was not observed');
    const before = memory.buffer.byteLength;
    for (let i = 0; i < 30; i++) await render();
    expect(memory.buffer.byteLength).toBe(before);
  } finally {
    WebAssembly.instantiate = instantiate;
    if (cacheDescriptor) Object.defineProperty(globalThis, 'caches', cacheDescriptor);
    else Reflect.deleteProperty(globalThis, 'caches');
  }
});
