import { mediaLinkRoute } from '@/lib/media-link';

/** Rewrite only inbound media URLs; auth callbacks and app routes pass through. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const route = mediaLinkRoute(path);
  if (route != null) return route;
  // Unsupported web pages must not become accidental Shinobu routes.
  if (/^https?:/i.test(path) || /^shinobu:\/\/open(?:[/?#]|$)/i.test(path)) return '/';
  return path;
}
