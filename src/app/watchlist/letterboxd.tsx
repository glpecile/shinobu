import { Redirect } from 'expo-router';

import { routes } from '@/lib/routes';

/**
 * The watchlist grid used to be Letterboxd's alone and lived here (plan 0024
 * U9); plan 0031 R24 merged it into one provider-neutral `/watchlist`. This URL
 * has shipped on web, so it stays as a redirect rather than being deleted —
 * bookmarks and deep links to it must land somewhere real, the same reason
 * `app/redirect.tsx` exists.
 */
export default function LetterboxdWatchlistRedirect() {
  return <Redirect href={routes.watchlist} />;
}
