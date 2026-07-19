import type { MediaType } from '@/types/media';

// Extension point: adding a provider means widening this union and adding a
// descriptor to registry.ts — nothing else in the app should need to change.
export type ProviderId = 'trakt' | 'anilist' | 'letterboxd';

// Metadata-only sources (no session, no registry entry, never a fan-out
// target) that still ride the shared error taxonomy. TMDB backs the person
// route; ani.zip stays out of this union because it degrades to null instead
// of failing (lib/providers/mapping/anizip.ts).
export type MetadataSourceId = 'tmdb';

/** Anything a ProviderError can originate from. */
export type ErrorSourceId = ProviderId | MetadataSourceId;

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
}
