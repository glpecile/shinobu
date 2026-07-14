/**
 * The one fetch signature both platform clients expose. Provider effects take
 * this via dependency injection (never importing a client file directly), so
 * tests run against a fake and `state/queries/*` wires the real one.
 *
 * Defined as a plain function type rather than `typeof globalThis.fetch` so
 * platform-specific properties (e.g. Bun's `preconnect`) do not leak into the
 * shared contract.
 */
export type HttpFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
