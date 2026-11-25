import { Redirect } from 'expo-router';

import { routes } from '@/lib/routes';

/**
 * On Android, `shinobu://redirect` arrives as a deep-link intent that both
 * `expo-web-browser` (resolving the OAuth session) and expo-router's Linking
 * listener receive. Without this route, expo-router lands on `+not-found`.
 */
export default function OAuthRedirect() {
  return <Redirect href={routes.settings} />;
}
