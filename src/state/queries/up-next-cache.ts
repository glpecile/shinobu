/**
 * The Up Next query root, in its own module for the same reason
 * `diary-cache.ts` and `search-cache.ts` exist: two modules need it and they
 * can't import each other. `state/queries/up-next.ts` builds its keys from it,
 * and `state/session` purges it on disconnect — importing the key builder
 * there directly would close a cycle, since `up-next.ts` reads the session.
 *
 * Why disconnect has to purge it at all: unlike every provider read, this key
 * carries *both* providers' inputs under one entry that doesn't name either of
 * them, so `removeQueries({ queryKey: [providerId] })` can't reach it. In
 * memory that was 60 seconds of staleness; persisted (`persist.ts`) it would
 * be a disconnected provider's data sitting on disk until `maxAge`.
 */
export const UP_NEXT_QUERY_ROOT = ['up-next'] as const;
