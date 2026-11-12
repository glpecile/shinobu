import type { QueryClient } from '@tanstack/react-query';

import { aniZipTmdbKind, type AniZipLookup } from '@/lib/providers/mapping/anizip';
import { Provider, type ProviderId } from '@/lib/providers/types';
import {
  cachedAniListFilmId,
  cachedAniListIdByTitle,
  cachedAniZipIds,
  cachedSimklAnimeIds,
  cachedTmdbAnimeMatch,
  cachedTmdbTvIdByTvdb,
  cachedTraktLookup,
  cachedTraktTextSearch,
} from '@/state/queries/mapping';
import { cachedLetterboxdFilm } from '@/state/queries/letterboxd';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * Cross-provider identity enrichment (plan 0011 decisions 5–6): before the
 * log fan-out routes, fill in the ids the item's origin provider couldn't
 * know — ani.zip bridges AniList ↔ TVDB/TMDB/IMDB, and a Trakt `/search`
 * lookup turns those into a real Trakt id. Lookups live in
 * `state/queries/mapping.ts` (cached forever — mappings don't churn) and
 * degrade to "no widening" on a miss, so an unmappable item just logs to its
 * origin provider.
 */
export async function enrichExternalIds(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
  connected: readonly ProviderId[],
): Promise<NormalizedMediaItem> {
  // A TV metadata variant cannot supply identities for a whole-entry movie log.
  if (item.tmdbTvVariant != null) return item;
  let externalIds = { ...item.externalIds };
  let filedAsFilm = false;

  const isAnime = item.type === 'ANIME';
  const isMovieTv = item.type === 'MOVIE' || item.type === 'TV';

  // Letterboxd's film page states the film's exact TMDB id, and whether the
  // "film" is a TV series, which has no movie identity elsewhere.
  if (
    item.type === 'MOVIE' &&
    externalIds.letterboxd != null &&
    externalIds.trakt == null &&
    externalIds.tmdb == null &&
    externalIds.imdb == null &&
    connected.some((id) => id !== Provider.Letterboxd)
  ) {
    const film = await cachedLetterboxdFilm(queryClient, externalIds.letterboxd);
    if (film?.tmdbTvVariant != null) return { ...item, tmdbTvVariant: film.tmdbTvVariant };
    if (film?.externalIds.tmdb != null) externalIds = { ...externalIds, tmdb: film.externalIds.tmdb };
  }

  // A movie carrying no movie-side id at all (a Letterboxd watchlist film is
  // just a slug + title + year) → resolve Trakt/TMDB/IMDB by text search, so a
  // "mark as watched" fans out to a real tracker instead of dead-ending on
  // Letterboxd. Runs before the reverse-map below, so the ids it discovers can
  // then bridge an anime film on to AniList too.
  //
  // Gated on Trakt **or Simkl**, not Trakt alone: the lookup itself stopped
  // being Trakt-only (plan 0034 KTD-8 — `movieSearchQuery` falls back to TMDB
  // `/search/movie`, which needs no tracker credential at all), and Simkl
  // resolves a movie write by `tmdb`/`imdb` — without them its leg fails with
  // "no Simkl-resolvable id" (`simkl/writes.ts`'s `idsFor`). Keeping the old
  // Trakt gate meant a Simkl user's Letterboxd film could not be logged.
  if (
    item.type === 'MOVIE' &&
    externalIds.trakt == null &&
    externalIds.tmdb == null &&
    externalIds.imdb == null &&
    item.title !== '' &&
    (connected.includes(Provider.Trakt) || connected.includes(Provider.Simkl))
  ) {
    const found = await cachedTraktTextSearch(queryClient, item.title, item.year);
    if (found != null) {
      externalIds = {
        ...externalIds,
        ...(found.externalIds.trakt != null ? { trakt: found.externalIds.trakt } : {}),
        ...(found.externalIds.tmdb != null ? { tmdb: found.externalIds.tmdb } : {}),
        ...(found.externalIds.imdb != null ? { imdb: found.externalIds.imdb } : {}),
      };
    }
  }

  // AniList-origin anime → movie/TV-side ids (only useful when a movie/TV
  // provider is connected). Serializd needs the tmdb id this yields (KTD2), so
  // an AniList+Serializd-only user must run this too, not just Trakt users —
  // and so must a Simkl one: ani.zip carries no `mal`, so without these bridge
  // ids Simkl's anime write falls all the way to its best-effort `anilist`-only
  // tier (`simkl/writes.ts`'s `idsFor`, Open Question 2), or to nothing at all
  // for an anime *film* routed to the movie targets.
  if (
    isAnime &&
    externalIds.anilist != null &&
    externalIds.trakt == null &&
    externalIds.tmdb == null &&
    externalIds.tvdb == null &&
    (connected.includes(Provider.Trakt) ||
      connected.includes(Provider.Serializd) ||
      connected.includes(Provider.Simkl) ||
      ((item.isFilm === true || item.totalEpisodes === 1) && connected.includes(Provider.Letterboxd)))
  ) {
    const anizip = await cachedAniZipIds(queryClient, {
      anilistId: externalIds.anilist,
    });
    // ani.zip lags a new release by days, and Simkl often links it already.
    const simkl =
      anizip?.tvdb != null || anizip?.tmdb != null
        ? null
        : await cachedSimklAnimeIds(queryClient, { anilist: externalIds.anilist });
    const bridged = simkl?.tvdb != null || simkl?.tmdb != null ? simkl : anizip;
    const isFilm = item.isFilm === true;
    // AniList files many single works as a one-episode OVA, ONA or special;
    // TMDB and Letterboxd file them as movies.
    const single = !isFilm && item.totalEpisodes === 1;
    const singleMovieId = !single
      ? undefined
      : bridged?.tmdb != null && aniZipTmdbKind(bridged) === 'movie'
        ? bridged.tmdb
        : bridged?.tvdb == null && bridged?.tmdb == null
          ? await cachedTmdbAnimeMatch(queryClient, item).then((found) =>
              found?.isFilm === true ? found.tmdbId : undefined,
            )
          : undefined;
    // The bridge gives one TMDB id without its kind (aniZipTmdbKind): a film
    // filed as a show's special carries the show's TV id.
    const bridgedTmdb =
      bridged != null && aniZipTmdbKind(bridged) === (isFilm ? 'movie' : 'tv') ? bridged.tmdb : undefined;
    // A film with no movie id takes the details read's TMDB title match
    // (The Last Blossom, 2025). A series doesn't: a wrong show would get
    // Trakt and Serializd writes with no ani.zip episode table.
    const match = isFilm && bridgedTmdb == null ? await cachedTmdbAnimeMatch(queryClient, item) : null;
    // A film's TVDB id names its parent show, never the film.
    const tvdb = isFilm ? undefined : bridged?.tvdb;
    // ani.zip's `themoviedb_id` can name a TMDB id that doesn't exist (a
    // sequel cour's own id), so a series takes TVDB → TMDB like the details
    // read does, and keeps ani.zip's only when that misses.
    const tmdb =
      match?.tmdbId ??
      (tvdb != null ? ((await cachedTmdbTvIdByTvdb(queryClient, tvdb)) ?? bridgedTmdb) : bridgedTmdb);
    // A non-film without a TVDB id is bridged to a movie: none of its ids is a show's.
    const imdb = isFilm || tvdb != null ? bridged?.imdb : undefined;
    if (singleMovieId != null) {
      filedAsFilm = true;
      externalIds = {
        ...externalIds,
        tmdb: singleMovieId,
        ...(bridged?.imdb != null ? { imdb: bridged.imdb } : {}),
      };
    } else {
      externalIds = {
        ...externalIds,
        ...(tvdb != null ? { tvdb } : {}),
        ...(tmdb != null ? { tmdb } : {}),
        ...(imdb != null ? { imdb } : {}),
      };
    }
  }

  // Bridge ids → a real Trakt id (progress reads and cache invalidation key
  // on it; /sync/history alone could live off tvdb/tmdb).
  if (isAnime && externalIds.trakt == null && connected.includes(Provider.Trakt)) {
    const kind = item.isFilm === true || filedAsFilm ? 'movie' : 'show';
    const lookup =
      kind === 'show' && externalIds.tvdb != null
        ? { source: 'tvdb' as const, id: externalIds.tvdb }
        : externalIds.tmdb != null
          ? { source: 'tmdb' as const, id: externalIds.tmdb }
          : externalIds.imdb != null
            ? { source: 'imdb' as const, id: externalIds.imdb }
            : null;
    if (lookup != null) {
      const found = await cachedTraktLookup(queryClient, { ...lookup, kind });
      if (found?.externalIds.trakt != null) {
        externalIds = { ...externalIds, trakt: found.externalIds.trakt };
      }
    }
  }

  // Trakt-origin movie/TV → reverse-map into AniList's world, which also
  // names the cour Simkl tracks a later season under.
  if (
    isMovieTv &&
    externalIds.anilist == null &&
    (connected.includes(Provider.AniList) || connected.includes(Provider.Simkl))
  ) {
    const lookup: AniZipLookup | null =
      item.type === 'TV' && externalIds.tvdb != null
        ? { tvdbId: externalIds.tvdb }
        : item.type === 'MOVIE' && externalIds.tmdb != null
          ? { tmdbId: externalIds.tmdb }
          : null;
    if (lookup != null) {
      const mapped = await cachedAniZipIds(queryClient, lookup);
      // A TMDB lookup also answers for a TV anime that has the movie's number.
      if (mapped?.anilist != null && (item.type !== 'MOVIE' || aniZipTmdbKind(mapped) === 'movie')) {
        externalIds = { ...externalIds, anilist: mapped.anilist };
      }
    }
  }

  // ani.zip's TMDB index is TV-oriented and misses many anime *films* (ChaO,
  // 2025), so a film opened from a TMDB/Trakt-first details page reverse-maps
  // to nothing above and logs only to Trakt + Letterboxd. Discovery fallback:
  // ask AniList directly, accepting only an exact-year film (KTD3). The
  // discovered id needs no routing change — `effectiveTypes` already widens on
  // `externalIds.anilist != null`. Miss path only, and the lookup (including
  // its misses) is cached forever, so an ordinary live-action film costs one
  // AniList request ever.
  if (
    item.type === 'MOVIE' &&
    externalIds.anilist == null &&
    item.title !== '' &&
    item.year != null &&
    connected.includes(Provider.AniList)
  ) {
    const anilistId = await cachedAniListFilmId(queryClient, {
      title: item.title,
      year: item.year,
    });
    if (anilistId != null) externalIds = { ...externalIds, anilist: anilistId };
  }

  // ani.zip and the film search both miss an anime that AniList files as a
  // series, ONA or special, often a new or obscure donghua.
  if (
    isMovieTv &&
    externalIds.anilist == null &&
    (connected.includes(Provider.AniList) || connected.includes(Provider.Simkl))
  ) {
    const anilistId = await cachedAniListIdByTitle(queryClient, item);
    if (anilistId != null) externalIds = { ...externalIds, anilist: anilistId };
  }

  return { ...item, externalIds, ...(filedAsFilm ? { isFilm: true } : {}) };
}
