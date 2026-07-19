// Provider web pages and endpoints that live entirely outside the app: the
// setup pages the connect flows link users to, plus OAuth endpoints that
// otherwise sit in react-native-importing modules. This module must stay free
// of react-native imports — scripts/check-external-urls.ts loads it under
// plain bun (bun can't parse RN's entry point) to probe that these URLs are
// still alive. Precedent for the risk: trakt.tv/oauth/applications died in
// July 2026, 301-redirecting into a 404 (docs/solutions/trakt-oauth-setup.md).

/** Where a user creates their own Trakt API app (BYO client id + secret). */
export const TRAKT_CREATE_APP_URL = 'https://app.trakt.tv/settings/apps/api/new';

/** Where a user creates their own AniList API client (BYO client id). */
export const ANILIST_CREATE_CLIENT_URL = 'https://anilist.co/settings/developer';

/** AniList implicit-grant authorize endpoint (re-exported by anilist/config). */
export const ANILIST_AUTHORIZE_URL = 'https://anilist.co/api/v2/oauth/authorize';
