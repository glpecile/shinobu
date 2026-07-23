// Provider web pages and endpoints that live entirely outside the app: the
// setup pages the connect flows link users to, OAuth endpoints that otherwise
// sit in react-native-importing modules, and the pure per-item public-page
// URL builder (`providerItemUrl`, plans 0022/0023) shared by the manual-log
// fallback and the "View on" links. The constants above must stay free of
// react-native imports — scripts/check-external-urls.ts loads them under
// plain bun (bun can't parse RN's entry point) to probe that these URLs are
// still alive. Precedent for the risk: trakt.tv/oauth/applications died in
// July 2026, 301-redirecting into a 404 (docs/solutions/trakt-oauth-setup.md).
// `providerItemUrl` only pulls in type-only imports (erased at build), so it
// doesn't break that constraint.

import { animeEffectiveMovieTvType } from './routing';
import type { ProviderId } from './types';
import type { NormalizedMediaItem } from '@/types/media';

/** Where a user creates their own Trakt API app (BYO client id + secret). */
export const TRAKT_CREATE_APP_URL = 'https://app.trakt.tv/settings/apps/api/new';

/** Where a user creates their own AniList API client (BYO client id). */
export const ANILIST_CREATE_CLIENT_URL = 'https://anilist.co/settings/developer';

/** AniList implicit-grant authorize endpoint (re-exported by anilist/config). */
export const ANILIST_AUTHORIZE_URL = 'https://anilist.co/api/v2/oauth/authorize';

export type UrlItem = Pick<NormalizedMediaItem, 'type' | 'isFilm' | 'externalIds'>;

/**
 * Whether `item` is movie-shaped in Trakt/Letterboxd's world: a MOVIE, or an
 * anime film — via the single shared `animeEffectiveMovieTvType` mapping
 * `routing.ts`'s `effectiveTypes` also uses, so the two can't silently
 * diverge on which anime counts as which shape.
 */
function isMovieShaped(item: UrlItem): boolean {
  return (
    item.type === 'MOVIE' ||
    (item.type === 'ANIME' && animeEffectiveMovieTvType(item) === 'MOVIE')
  );
}

/** Whether `item` is show-shaped in Trakt's world: TV, or a non-film anime. */
function isShowShaped(item: UrlItem): boolean {
  return (
    item.type === 'TV' ||
    (item.type === 'ANIME' && animeEffectiveMovieTvType(item) === 'TV')
  );
}

function traktUrl(item: UrlItem): string | null {
  const shape = isMovieShaped(item) ? 'movie' : isShowShaped(item) ? 'show' : null;
  if (shape == null) return null;
  const { trakt, tmdb } = item.externalIds;
  if (trakt != null) {
    return `https://trakt.tv/${shape === 'movie' ? 'movies' : 'shows'}/${trakt}`;
  }
  if (tmdb != null) {
    return `https://trakt.tv/search/tmdb/${tmdb}?id_type=${shape}`;
  }
  return null;
}

function anilistUrl(item: UrlItem): string | null {
  const id = item.externalIds.anilist;
  if (id == null) return null;
  return `https://anilist.co/${item.type === 'MANGA' ? 'manga' : 'anime'}/${id}`;
}

/** Letterboxd only has film pages — movies and anime films, never TV. */
function letterboxdUrl(item: UrlItem): string | null {
  if (!isMovieShaped(item)) return null;
  const { letterboxd, tmdb } = item.externalIds;
  if (letterboxd != null) return `https://letterboxd.com/film/${letterboxd}/`;
  if (tmdb != null) return `https://letterboxd.com/tmdb/${tmdb}`;
  return null;
}

/** Serializd is TV-only (registry mediaTypes) and tmdb-keyed, no slug fallback. */
function serializdUrl(item: UrlItem): string | null {
  if (!isShowShaped(item)) return null;
  const tmdb = item.externalIds.tmdb;
  return tmdb == null ? null : `https://serializd.com/show/${tmdb}`;
}

/**
 * The provider's public page for `item`, or null when no id path exists
 * (plan 0022 R8, shared with plan 0023's link selector). Pure and
 * platform-free — callers open the result via `@/lib/open-external-url`.
 */
export function providerItemUrl(providerId: ProviderId, item: UrlItem): string | null {
  switch (providerId) {
    case 'trakt':
      return traktUrl(item);
    case 'anilist':
      return anilistUrl(item);
    case 'letterboxd':
      return letterboxdUrl(item);
    case 'serializd':
      return serializdUrl(item);
  }
}

const PROVIDER_HOME_URLS: Record<ProviderId, string> = {
  trakt: 'https://trakt.tv',
  anilist: 'https://anilist.co',
  letterboxd: 'https://letterboxd.com',
  serializd: 'https://serializd.com',
};

/**
 * The provider's log surface root — the degrade target for the manual-log
 * row (plan 0022 R4) when `providerItemUrl` can't build an item-specific URL.
 * The affordance must never vanish silently.
 */
export function providerHomeUrl(providerId: ProviderId): string {
  return PROVIDER_HOME_URLS[providerId];
}
