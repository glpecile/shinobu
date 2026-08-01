// Provider web pages and endpoints that live entirely outside the app: the
// setup pages the connect flows link users to, OAuth endpoints that otherwise
// sit in react-native-importing modules, and the pure per-item public-page
// URL builder (`providerItemUrl`, plans 0022/0023) shared by the manual-log
// fallback and the "View on" links. The constants above must stay free of
// react-native imports — scripts/check-external-urls.ts loads them under
// plain bun (bun can't parse RN's entry point) to probe that these URLs are
// still alive. Precedent for the risk: trakt.tv/oauth/applications died in
// July 2026, 301-redirecting into a 404 (docs/solutions/trakt-oauth-setup.md).
// `providerItemUrl` and `providerPersonUrl` only pull in type-only imports
// (erased at build), so they don't break that constraint.

import { animeEffectiveMovieTvType } from './routing';
import type { ProviderId } from './types';
import type { NormalizedMediaItem, NormalizedPerson } from '@/types/media';

/** Where a user creates their own Trakt API app (BYO client id + secret). */
export const TRAKT_CREATE_APP_URL = 'https://app.trakt.tv/settings/apps/api/new';

/** Where a user creates their own AniList API client (BYO client id). */
export const ANILIST_CREATE_CLIENT_URL = 'https://anilist.co/settings/developer';

/** AniList implicit-grant authorize endpoint (re-exported by anilist/config). */
export const ANILIST_AUTHORIZE_URL = 'https://anilist.co/api/v2/oauth/authorize';

/** Where a user copies their own TMDB v4 read token (BYO key, plan 0024 U10). */
export const TMDB_API_SETTINGS_URL = 'https://www.themoviedb.org/settings/api';

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
 * Simkl pages are shape-keyed by the simkl id (plan 0034 U1): anime — series
 * and films alike — lives under its own /anime section, so the shape follows
 * the item's *native* type first and the movie/TV split only for the rest.
 * With no simkl id, the documented id-redirect resolves a tmdb id server-side
 * — the same missing-id degradation shape as Trakt's search redirect. MANGA
 * has no Simkl surface at all.
 */
function simklUrl(item: UrlItem): string | null {
  const shape =
    item.type === 'ANIME'
      ? 'anime'
      : isMovieShaped(item)
        ? 'movies'
        : isShowShaped(item)
          ? 'tv'
          : null;
  if (shape == null) return null;
  const { simkl, tmdb } = item.externalIds;
  if (simkl != null) return `https://simkl.com/${shape}/${simkl}`;
  if (tmdb != null) {
    const redirectType = shape === 'movies' ? 'movie' : shape === 'tv' ? 'show' : 'anime';
    return `https://api.simkl.com/redirect?tmdb=${tmdb}&type=${redirectType}`;
  }
  return null;
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
    case 'simkl':
      return simklUrl(item);
  }
}

/**
 * What the person builders need. TMDB is the only source of people, so `name`
 * and the department are all a Letterboxd link takes — `anilistId` is the
 * resolved staff id (plan 0035 R12), supplied by the caller because resolving
 * it is a network read and this module is pure.
 */
export type UrlPerson = Pick<NormalizedPerson, 'name' | 'knownForDepartment'> & {
  anilistId?: number;
};

/**
 * TMDB's `known_for_department` (lowercased) → the role segment Letterboxd
 * files a person's page under. Letterboxd splits people by craft rather than
 * by department, so the mapping is lossy by design: "Sound" is overwhelmingly
 * composers among the people we surface, "Camera" is cinematography. Anything
 * unmapped (Art, Costume & Make-Up, Visual Effects, Crew, …) or missing falls
 * back to `actor` — the biggest bucket, and a wrong guess costs a 404 on an
 * already best-effort link, never a broken screen.
 */
const LETTERBOXD_PERSON_ROLES: Record<string, string> = {
  acting: 'actor',
  directing: 'director',
  writing: 'writer',
  production: 'producer',
  sound: 'composer',
  editing: 'editor',
  camera: 'cinematography',
};

const LETTERBOXD_DEFAULT_PERSON_ROLE = 'actor';

/**
 * A person's name as Letterboxd slugs it: diacritics folded onto their base
 * letter ("Joaquín" → "joaquin"), then every run of non-alphanumerics —
 * spaces, apostrophes, middle dots, periods — collapsed to a single hyphen
 * and trimmed off the ends. Returns '' for a name with no ASCII-alphanumeric
 * content at all (a CJK-only name), which the caller turns into "no link"
 * rather than a URL with an empty segment.
 *
 * Strips `\p{Mn}` (combining marks left by NFD), *not* `\p{Diacritic}` as
 * `pick-movie-match.ts` does: the Diacritic property also covers standalone
 * punctuation like U+00B7 MIDDLE DOT, which deleting would fuse "WALL·E" into
 * "walle" instead of separating it. Here the separator must survive to become
 * a hyphen.
 */
export function letterboxdPersonSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Guessed from the name — Letterboxd person pages are slug-keyed and we hold
 * no Letterboxd person id, so this is best-effort by construction (unlike
 * `letterboxdUrl`, which prefers a real slug from `externalIds`).
 */
function letterboxdPersonUrl(person: UrlPerson): string | null {
  const slug = letterboxdPersonSlug(person.name);
  if (slug === '') return null;
  const department = person.knownForDepartment?.trim().toLowerCase() ?? '';
  const role = LETTERBOXD_PERSON_ROLES[department] ?? LETTERBOXD_DEFAULT_PERSON_ROLE;
  return `https://letterboxd.com/${role}/${slug}/`;
}

/**
 * An AniList staff page, by id (plan 0035 R11). The previous shape was a
 * name *search* — which sounds like a graceful fallback and is not: most TMDB
 * people have no AniList entry at all, so the overwhelmingly common outcome was
 * a link that opened an empty search results page. Id or nothing, same
 * never-relax-to-a-near-miss rule as the match pickers.
 *
 * The id comes from the caller (`state/queries/anilist.ts` resolves it, or an
 * AniList-sourced payload carried it) precisely because this module has to stay
 * pure — no async resolution can live here.
 */
export function anilistStaffUrl(id: number): string {
  return `https://anilist.co/staff/${id}`;
}

/** An AniList studio page, by id — the studio half of `anilistStaffUrl`. */
export function anilistStudioUrl(id: number): string {
  return `https://anilist.co/studio/${id}`;
}

/**
 * A Letterboxd studio page. Slug-keyed like its person pages and built with the
 * same rules (`letterboxdPersonSlug`), so "A24" → `/studio/a24/`. Best-effort by
 * construction — we hold no Letterboxd studio id — and null for a name with no
 * ASCII-alphanumeric content, which the caller turns into "no link" rather than
 * a URL with an empty segment.
 */
export function letterboxdStudioUrl(name: string): string | null {
  const slug = letterboxdPersonSlug(name);
  if (slug === '') return null;
  return `https://letterboxd.com/studio/${slug}/`;
}

/**
 * The provider's public page for a person, or null when that provider has no
 * person surface we can address. Trakt and Serializd return null deliberately
 * (owner decision, plan 0025): Trakt people pages need a Trakt person slug we
 * never resolve, and Serializd has no person surface at all. Simkl joins them
 * (plan 0034 U1): its people pages are simkl-person-id keyed and TMDB people
 * carry no such id.
 *
 * AniList needs `anilistId` on the person (plan 0035 R13) and returns null
 * without it — the resolution is a query, upstream of here, and a person nobody
 * could resolve gets **no pill**, never a search link.
 *
 * Same purity contract as `providerItemUrl` — pure string building, no
 * react-native import, so `scripts/check-external-urls.ts` keeps loading this
 * module under plain bun.
 */
export function providerPersonUrl(
  providerId: ProviderId,
  person: UrlPerson,
): string | null {
  switch (providerId) {
    case 'letterboxd':
      return letterboxdPersonUrl(person);
    case 'anilist':
      return person.anilistId == null ? null : anilistStaffUrl(person.anilistId);
    case 'trakt':
    case 'serializd':
    case 'simkl':
      return null;
  }
}

/** What the studio builders need — the name, plus an AniList id when resolved. */
export interface UrlStudio {
  name: string;
  /** AniList studio id — carried by AniList credits, resolved by search otherwise. */
  anilistId?: number;
}

/**
 * The provider's public page for a studio (plan 0035 R9/R10), or null.
 * Letterboxd files studios by slug and always builds one; AniList needs a
 * resolved id and hides without it, exactly like `providerPersonUrl`. Trakt,
 * Serializd and Simkl have no addressable studio surface at all.
 */
export function providerStudioUrl(
  providerId: ProviderId,
  studio: UrlStudio,
): string | null {
  switch (providerId) {
    case 'letterboxd':
      return letterboxdStudioUrl(studio.name);
    case 'anilist':
      return studio.anilistId == null ? null : anilistStudioUrl(studio.anilistId);
    case 'trakt':
    case 'serializd':
    case 'simkl':
      return null;
  }
}

const PROVIDER_HOME_URLS: Record<ProviderId, string> = {
  trakt: 'https://trakt.tv',
  anilist: 'https://anilist.co',
  letterboxd: 'https://letterboxd.com',
  serializd: 'https://serializd.com',
  simkl: 'https://simkl.com',
};

/**
 * The provider's log surface root — the degrade target for the manual-log
 * row (plan 0022 R4) when `providerItemUrl` can't build an item-specific URL.
 * The affordance must never vanish silently.
 */
export function providerHomeUrl(providerId: ProviderId): string {
  return PROVIDER_HOME_URLS[providerId];
}
