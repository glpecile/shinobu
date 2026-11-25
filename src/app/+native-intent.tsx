import { mediaLinkRoute } from '@/lib/media-link';
import { routes } from '@/lib/routes';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const route = mediaLinkRoute(path);
  if (route != null) return route;
  if (/^https?:/i.test(path) || /^shinobu:\/\/open(?:[/?#]|$)/i.test(path)) return routes.home;
  return path;
}
