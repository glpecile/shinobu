import type { MediaType } from '@/types/media';

// Extension point: adding a provider means widening this union and adding a
// descriptor to registry.ts — nothing else in the app should need to change.
export type ProviderId = 'trakt' | 'anilist' | 'letterboxd' | 'serializd';

// Metadata-only sources (no session, no registry entry, never a fan-out
// target) that still ride the shared error taxonomy. TMDB backs the person
// route; ani.zip stays out of this union because it degrades to null instead
// of failing (lib/providers/mapping/anizip.ts).
export type MetadataSourceId = 'tmdb';

/** Anything a ProviderError can originate from. */
export type ErrorSourceId = ProviderId | MetadataSourceId;

/**
 * How well a provider supports one *write verb* (plan 0031 R5/KTD-1).
 *
 * - `'write'` — the fan-out has a working adapter for it on the platforms not
 *   listed in `unsupportedWritePlatforms`.
 * - `'manual'` — applicable, but Shinobu cannot perform it: routing keeps the
 *   provider as a target and surfaces an external link instead (plan 0022).
 * - `'none'` — the verb does not exist for this provider at all, so it is
 *   excluded outright rather than shown a link that means nothing.
 *
 * **Deliberately three-state, not a boolean.** The applicability filter and the
 * transport are different axes, and a boolean conflates them: `false` sits at
 * the same filter position as `canWrite` (`routing.ts`'s `providersForWrite`),
 * so it would delete the provider *before* `splitWriteTargets` ever sees it —
 * the provider then lands in neither `writable` nor `manual` and produces **no
 * outcome at all**. That silent drop is exactly what AGENTS.md's no-dead-end
 * rule forbids. A `Set` of supported verbs at that position fails the same way.
 */
export type WriteSupport = 'write' | 'manual' | 'none';

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
  /**
   * Whether adding an item to this provider's **watchlist** is possible
   * (plan 0031 R5/KTD-1). Deliberately **not** derived from `canWrite`: the
   * four providers give four different answers to the watchlist verb (Trakt
   * confirmed and transport-ready, AniList confirmed but status-guard-gated,
   * Letterboxd endpoint-unverified and web-banned, Serializd proxy-gated) and
   * none of them is derivable from "can log a diary entry". Reusing `canWrite`
   * would route Letterboxd a payload whose path is unverified, and it would
   * make the two verbs impossible to degrade independently.
   */
  watchlistWrite: WriteSupport;
  /**
   * Whether *removing* an item from this provider's watchlist is possible
   * (plan 0031 R33/KTD-15). A **second field rather than a second meaning for
   * `watchlistWrite`**, because the verbs legitimately diverge on day one:
   * Letterboxd's add and remove are gated by the same spike but can resolve
   * differently (R37's toggle case makes remove safe from the surface while the
   * add stays unsafe), and Trakt's add can hit a 420 account limit its remove
   * never can. Deriving remove from write (`canRemove = write === 'write'`) is
   * the symmetry assumption this interface's docblock already warns against.
   *
   * The *platform* axis has **not** diverged — Letterboxd is web-banned for
   * every write verb by the same fingerprint wall — so `unsupportedWritePlatforms`
   * stays one flat list shared by all verbs. Verb splits; platform does not.
   */
  watchlistRemove: WriteSupport;
  /**
   * Platforms (`process.env.EXPO_OS` values) where this provider's write is
   * structurally impossible even though `canWrite` is true overall — e.g.
   * Letterboxd on web needs the native WebView session (plan 0018/0022).
   * Routing splits these into a "manual" target: shown as a log target, but
   * excluded from the fan-out and given an external link instead.
   */
  unsupportedWritePlatforms?: readonly string[];
}
