import type { QueryClient } from '@tanstack/react-query';

import { enrichExternalIds } from '@/features/log-media/enrich';
import { currentPlatform } from '@/features/log-media/use-log-targets';
import type { WatchlistEntry } from '@/features/watchlist/types';
import { providersForWrite, splitWriteTargets } from '@/lib/providers/routing';
import type { ProviderId } from '@/lib/providers/types';
import type { ProviderFailure } from '@/state/queries/settle';
import { watchlistReadProviders } from '@/state/queries/watchlist';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * The watchlist *remove* verb's front half (plan 0031 U16) — the sibling of
 * `targets.ts`, and for the same reason that file exists: the decisions belong
 * outside the hook so they can be checked without a renderer.
 *
 * The one structural difference from the add is the input. A removal is offered
 * against a `WatchlistEntry`, which knows its `sources`, so it routes **only to
 * the providers that actually hold the item** (R35) — a remove never fires
 * against a provider whose membership is unknown. Everything else (enrichment,
 * `splitWriteTargets`, the manual bucket) is the add's pipeline with a different
 * `WriteCapability`, per R38.
 */

/** What `useUnwatchlistMedia().mutate()` accepts. */
export interface UnwatchlistMediaVariables {
  /**
   * Caller opt-out — narrows to this subset of the routed targets, the same
   * escape hatch the add takes. The entry is fixed at hook-call time so the
   * `mutationKey` can carry its id (R18's shared pending guard, R38).
   */
  providers?: ProviderId[];
  /**
   * The user saw the destructive warning and pressed again (plan 0035 R3).
   * Passed straight to `deleteAniListEntry`, where it lifts the refusal guard
   * and nothing else — the fresh-read/fresh-id invariants (R5) are untouched.
   * Never defaulted on: without an explicit confirm this stays absent.
   */
  allowDestructive?: boolean;
}

/** What every removal adapter sees — the item, plus the destructive opt-in (KTD-7). */
export interface WatchlistRemovePayload {
  item: NormalizedMediaItem;
  allowDestructive?: boolean;
}

export interface WatchlistRemovePlan {
  /** The enriched item — every downstream step runs on this, not the entry's copy. */
  item: NormalizedMediaItem;
  /** Providers whose adapter runs, in routing order — always a subset of `sources`. */
  targets: ProviderId[];
  /**
   * Providers *holding* the item that the fan-out cannot remove from: declared
   * `'manual'` for this verb (Serializd until its read leg lands) or
   * platform-banned (Letterboxd on web). R17's deep-link rows.
   */
  manual: ProviderId[];
  /**
   * Applicable, connected providers whose membership is **unknown** (R35).
   * Rendered as manual rows exactly like `manual`, and kept as its own field
   * because it additionally withholds the settled "Removed" label — the two
   * buckets look identical on screen and mean different things.
   */
  unknown: ProviderId[];
}

/**
 * Whether a provider's watchlist membership for `item` is knowable from the
 * gather at all (plan 0031 R35). Three connected-and-applicable cases can never
 * appear in a `WatchlistEntry`'s `sources` no matter what the user's watchlists
 * hold, and treating any of them as "not on the list" is a claim the app has no
 * evidence for:
 *
 * - **Serializd** — no watchlist read leg in v1 (R32), so it is never in
 *   `WATCHLIST_READ_PROVIDERS`. Reading that list rather than re-listing the
 *   providers here is deliberate: the day R32's leg lands, this answer changes
 *   with it instead of staying wrong in a second copy.
 * - **AniList for MANGA** — the leg is `fetchPlannedAnime`, a selector over the
 *   `type: ANIME` shared list read (OQ-4a defers the manga read).
 * - **Any leg that errored on this gather** — R29 renders the grid with that
 *   leg's rows missing, which is indistinguishable from the provider not
 *   holding the item.
 * - **Any leg that succeeded but read only part of the list** — Letterboxd's
 *   scrape is paginated behind `onEndReached` and is never auto-paged, so a
 *   film sitting on page 3 of a 600-film watchlist is absent from `sources` for
 *   a reason that has nothing to do with membership. A healthy leg is evidence
 *   of non-membership only where it actually looked at the whole list.
 */
export function hasWatchlistReadLeg(
  provider: ProviderId,
  item: Pick<NormalizedMediaItem, 'type'>,
  connected: readonly ProviderId[],
  errors: readonly ProviderFailure[],
  incomplete: readonly ProviderId[] = [],
): boolean {
  if (!watchlistReadProviders(connected).includes(provider)) return false;
  if (provider === 'anilist' && item.type === 'MANGA') return false;
  if (incomplete.includes(provider)) return false;
  return !errors.some((failure) => failure.provider === provider);
}

/**
 * Routing-order split of a removal's targets (R35/R38). `writable` and `manual`
 * are both intersected with `sources` — the fan-out and the deep link are two
 * ways of acting on an item the provider *has* — while `unknown` is the
 * complement: applicable and connected, absent from `sources`, and with no
 * healthy read leg to have proven that absence.
 *
 * Only a provider with a healthy read leg that did not return the item is
 * known-absent, and it is the one case that is dropped silently.
 *
 * Pure, and platform is passed in rather than read, like `splitWriteTargets`.
 */
export function splitWatchlistRemoveTargets(
  item: NormalizedMediaItem,
  sources: readonly ProviderId[],
  connected: readonly ProviderId[],
  platform: string,
  errors: readonly ProviderFailure[],
  incomplete: readonly ProviderId[] = [],
): { targets: ProviderId[]; manual: ProviderId[]; unknown: ProviderId[] } {
  const { writable, manual } = splitWriteTargets(
    item,
    connected,
    platform,
    'watchlist-remove',
  );
  const unknown = providersForWrite(item, connected, 'watchlist-remove').filter(
    (provider) =>
      !sources.includes(provider) &&
      !hasWatchlistReadLeg(provider, item, connected, errors, incomplete),
  );
  return {
    targets: writable.filter((provider) => sources.includes(provider)),
    manual: manual.filter((provider) => sources.includes(provider)),
    unknown,
  };
}

/**
 * Enrich → route → intersect with `sources`. Identity enrichment applies here
 * for the same reason it does on the add, and one case makes it load-bearing:
 * a merged anime entry's item is AniList's copy (the precedence winner), which
 * routinely carries no trakt/tmdb id — and `removeFromTraktWatchlist` needs one
 * even though Trakt is demonstrably holding the item.
 */
export async function planWatchlistRemove(
  queryClient: QueryClient,
  entry: WatchlistEntry,
  connected: readonly ProviderId[],
  errors: readonly ProviderFailure[] = [],
  variables: UnwatchlistMediaVariables = {},
  incomplete: readonly ProviderId[] = [],
): Promise<WatchlistRemovePlan> {
  const enriched = await enrichExternalIds(queryClient, entry.item, connected);
  const platform = currentPlatform();

  const split = splitWatchlistRemoveTargets(
    enriched,
    entry.sources,
    connected,
    platform,
    errors,
    incomplete,
  );
  const only = variables.providers;
  const targets =
    only == null || only.length === 0
      ? split.targets
      : split.targets.filter((provider) => only.includes(provider));

  return { item: enriched, targets, manual: split.manual, unknown: split.unknown };
}

/**
 * R12 as amended on 2026-07-28: on `/watchlist` the sheet offers the **add** row
 * only when some applicable connected provider is not already holding the item.
 *
 * The original excluded `/watchlist/letterboxd` entirely, on the grounds that
 * every row there is already watchlisted. A cross-provider surface inverts that
 * reasoning — a film on the Letterboxd watchlist and *not* on Trakt's is exactly
 * where an add is most useful — so the exclusion narrows to "already everywhere
 * it can go". `sources` is the per-provider form of the same fact
 * `useIsWatchlisted` answers for the whole item; the whole-item boolean cannot
 * express "on one of your three trackers", which is the state this rule is about.
 *
 * Manual add targets count as offerable: Letterboxd's add is a manual row rather
 * than a write, and a row that deep-links the user to the one tracker still
 * missing the film is the affordance, not a dead end.
 *
 * **R35 applies to the add side too**, which is what the first live run of this
 * sheet made obvious. A Trakt-sourced series rendered four stacked rows — a
 * disabled "On your watchlist", "Add on Serializd", "Remove from watchlist" and
 * "Remove on Serializd" — two of them pointing the same provider in opposite
 * directions. The bug is not the clutter, it is the claim: "Add on Serializd"
 * asserts Serializd does not have the show, and Serializd has no watchlist read
 * leg in v1, so the app has no evidence for that. A provider whose membership is
 * unknown is therefore **not** counted as missing the item — the removal side
 * already offers it an honest `Remove on …` link, and one link to the provider's
 * page is the whole affordance either way.
 */
export function shouldOfferWatchlistAdd(
  entry: WatchlistEntry,
  connected: readonly ProviderId[],
  platform: string,
  errors: readonly ProviderFailure[] = [],
  incomplete: readonly ProviderId[] = [],
): boolean {
  const { writable, manual } = splitWriteTargets(
    entry.item,
    connected,
    platform,
    'watchlist',
  );
  return [...writable, ...manual].some(
    (provider) =>
      !entry.sources.includes(provider) &&
      hasWatchlistReadLeg(provider, entry.item, connected, errors, incomplete),
  );
}
