/**
 * A web tab that outlives a deploy still runs the old bundle, and the old
 * route chunks are gone: the Worker answers their hashes with the 404 page,
 * so Expo's chunk loader throws `AsyncRequireError` ("Loading module … failed").
 * Retrying asks for the same missing file, so only a reload recovers
 * (docs/solutions/web-stale-route-chunks-after-deploy.md).
 */
export function isStaleBundleError(error: unknown): boolean {
  return process.env.EXPO_OS === 'web' && error instanceof Error && error.name === 'AsyncRequireError';
}

const RELOADED_AT_KEY = 'shinobu.stale-bundle-reload';
// A chunk still missing after a fresh page load is a broken deploy, not a
// stale tab: the second failure inside this window shows the fallback.
const LOOP_GUARD_MS = 10_000;

/** The root error boundary's `onError`: reloads the page once for a stale chunk. */
export function reloadOnStaleBundle(error: unknown): void {
  if (!isStaleBundleError(error)) return;
  const last = Number(window.sessionStorage.getItem(RELOADED_AT_KEY) ?? 0);
  if (Date.now() - last < LOOP_GUARD_MS) return;
  window.sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
  window.location.reload();
}
