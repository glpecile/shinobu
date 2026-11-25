import { Provider, type ProviderDescriptor, type ProviderId } from './types';

/** The provider capability registry. Routing derives its read and write targets here. */
export const PROVIDERS: Record<ProviderId, ProviderDescriptor> = {
  [Provider.Trakt]: {
    id: Provider.Trakt,
    label: 'Trakt',
    mediaTypes: ['TV', 'MOVIE'],
    canRead: true,
    canWrite: true,
    watchlistWrite: 'write',
    watchlistRemove: 'write',
    // Trakt's hidden/dropped endpoint has unverified effects on history and progress
    // (docs/solutions/tracking-status-provider-support.md).
    trackingStatus: 'manual',
    communityScore: false,
  },
  [Provider.AniList]: {
    id: Provider.AniList,
    label: 'AniList',
    mediaTypes: ['ANIME', 'MANGA'],
    canRead: true,
    canWrite: true,
    // The adapter adds Planning only after reading the current list status.
    watchlistWrite: 'write',
    watchlistRemove: 'write',
    trackingStatus: 'write',
    // `averageScore`, a percentage.
    communityScore: true,
  },
  // Public reads use the GET-only relay on web. Film logs write in a signed-in
  // session through the native WebView or the optional web userscript bridge.
  [Provider.Letterboxd]: {
    id: Provider.Letterboxd,
    label: 'Letterboxd',
    mediaTypes: ['MOVIE'],
    canRead: true,
    canWrite: true,
    // Web defaults to manual. Routing enables each write supported by the detected userscript.
    unsupportedWritePlatforms: ['web'],
    // Letterboxd sets watchlist membership explicitly, making repeat adds idempotent
    // (docs/solutions/letterboxd-watchlist-write.md).
    watchlistWrite: 'write',
    watchlistRemove: 'write',
    trackingStatus: 'none',
    // The film page's JSON-LD `aggregateRating`, out of 5.
    communityScore: true,
  },
  // Serializd tracks TV by TMDB id. Native uses its bearer API directly and web uses the
  // same-origin relay.
  [Provider.Serializd]: {
    id: Provider.Serializd,
    label: 'Serializd',
    mediaTypes: ['TV'],
    canRead: true,
    canWrite: true,
    // Serializd remove stays manual until its watchlist read can supply membership. Its
    // season-scoped add can coexist with watched progress
    // (docs/solutions/serializd-watchlist-clears-watched.md).
    watchlistWrite: 'write',
    watchlistRemove: 'manual',
    // Serializd pauses and drops whole shows by show_id
    // (docs/solutions/tracking-status-provider-support.md).
    trackingStatus: 'write',
    // Its API has no average; only the www page shows one (#318).
    communityScore: false,
  },
  [Provider.Simkl]: {
    id: Provider.Simkl,
    label: 'Simkl',
    // Simkl can match an unmapped anime series or film directly.
    mediaTypes: ['TV', 'MOVIE', 'ANIME'],
    canRead: true,
    canWrite: true,
    watchlistWrite: 'write',
    // Simkl's only removal endpoint also clears history and ratings. The adapter checks the
    // current entry and requires separate confirmation before deleting a row with history.
    watchlistRemove: 'write',
    // `/sync/add-to-list` with `to: 'hold' | 'dropped'`. A history add
    // re-files the item on its own, so a new log resumes it.
    trackingStatus: 'write',
    // `/ratings` also carries the IMDb (movies, TV) or MAL (anime) score.
    communityScore: true,
  },
  // Hardcover handles books carrying a Hardcover id.
  [Provider.Hardcover]: {
    id: Provider.Hardcover,
    label: 'Hardcover',
    mediaTypes: ['BOOK'],
    canRead: true,
    canWrite: true,
    // Want to Read is status 1. The adapter deletes only a bare entry of that status.
    watchlistWrite: 'write',
    watchlistRemove: 'write',
    // Paused (4) and Did Not Finish (5) through `update_user_book`.
    trackingStatus: 'write',
    // A book's average rating, out of 5.
    communityScore: true,
  },
};
