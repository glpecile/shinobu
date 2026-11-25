import type { MediaType } from '@/types/media';

// Extension point: adding a provider means adding an id here and a descriptor
// to registry.ts — nothing else in the app should need to change. The values are
// persisted (session keys, query keys) and in URLs, so they never change.
export const Provider = {
  Trakt: 'trakt',
  AniList: 'anilist',
  Letterboxd: 'letterboxd',
  Serializd: 'serializd',
  Simkl: 'simkl',
  Hardcover: 'hardcover',
} as const;
export type ProviderId = (typeof Provider)[keyof typeof Provider];

// Metadata-only sources (no session, no registry entry, never a fan-out
// target) that still ride the shared error taxonomy. TMDB backs the person
// route, Wikidata the Rotten Tomatoes and Metacritic scores. ani.zip stays out
// of this union because it degrades to null instead of failing
// (lib/providers/mapping/anizip.ts).
export type MetadataSourceId = 'tmdb' | 'wikidata';

/** Anything a ProviderError can originate from. */
export type ErrorSourceId = ProviderId | MetadataSourceId;

/**
 * Write uses an adapter, manual exposes a provider link, and none excludes the provider for
 * this verb.
 */
export type WriteSupport = 'write' | 'manual' | 'none';

/** The status the pause and drop verbs set (#227). */
export type TrackingStatus = 'paused' | 'dropped';

/**
 * Capability declaration for one provider. Providers are NOT assumed to be
 * symmetric read+write: future integrations (games, books, music) are often
 * read-only or CSV-only, and even Letterboxd may end up degraded (todos/004).
 * `useUnifiedFeed` aggregates connected providers with `canRead`;
 * `useLogMedia` fans out to connected + applicable providers with `canWrite`.
 */
export interface ProviderDescriptor {
  id: ProviderId;
  label: string;
  /** Media types this provider applies to (anime films match via `isFilm`, see routing.ts). */
  mediaTypes: readonly MediaType[];
  canRead: boolean;
  canWrite: boolean;
  /** Watchlist adds are independent of diary-write support. */
  watchlistWrite: WriteSupport;
  /** Removal is its own capability and can be manual even when adds work. */
  watchlistRemove: WriteSupport;
  /**
   * Whether pausing or dropping a series or book is possible (#227,
   * plan 0123). A status change that keeps progress and history, so it is
   * not implied by `canWrite` or the watchlist verbs.
   */
  trackingStatus: WriteSupport;
  /**
   * Whether the provider publishes a community score the details Ratings
   * section reads (#318). Trakt's and Serializd's stay links only.
   */
  communityScore: boolean;
  /**
   * Platforms (`process.env.EXPO_OS` values) where this provider's write is
   * structurally impossible even though `canWrite` is true overall — e.g.
   * Letterboxd on web needs the native WebView session (plan 0018/0022).
   * Routing splits these into a "manual" target: shown as a log target, but
   * excluded from the fan-out and given an external link instead.
   */
  unsupportedWritePlatforms?: readonly string[];
}
