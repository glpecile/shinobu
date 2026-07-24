import { Redirect } from 'expo-router';

/**
 * Lands `shinobu://redirect` (Trakt's `?code=...&state=...`, AniList's
 * `#access_token=...`) on a real matched route instead of expo-router's
 * "Unmatched Route" screen.
 *
 * On iOS, `openAuthSessionAsync` uses `ASWebAuthenticationSession`, which
 * intercepts the redirect at the OS level before the app's own URL handling
 * ever sees it — expo-router never navigates. On Android the redirect is a
 * normal deep-link intent to `MainActivity`: `expo-web-browser`'s listener
 * resolves the pending auth promise (the actual token/code exchange already
 * happens in `connect-trakt-button.tsx` / `connect-anilist-button.tsx`), but
 * expo-router's own Linking listener sees the same intent and, finding no
 * route named "redirect", lands on +not-found. This route exists purely to
 * give it somewhere real to land — send it straight to the Connect screen.
 */
export default function OAuthRedirect() {
  return <Redirect href="/(tabs)/connect" />;
}
