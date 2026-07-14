import type { HttpFetch } from './types';

// Wrapped (not aliased) so fetch keeps its window binding — a bare
// `const f = fetch` throws "Illegal invocation" when called in browsers.
export const httpFetch: HttpFetch = (input, init) => globalThis.fetch(input, init);
