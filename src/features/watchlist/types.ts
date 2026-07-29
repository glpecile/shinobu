import type { ProviderId } from '@/lib/providers/types';
import type { ProviderFailure } from '@/state/queries/settle';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * The cross-provider watchlist data contract (plan 0031 KTD-11). Modelled
 * beat-for-beat on `features/up-next/types.ts`: the query layer gathers raw
 * per-provider *inputs*, and one pure function merges them into *entries* at
 * render time. Nothing downstream re-derives which provider a row came from.
 *
 * **This is not the agenda** (R22). `WatchlistEntry` is deliberately not an
 * `UpNextEntry` and never becomes one: an item is watchlisted whether or not it
 * has a release instant to place, so the two surfaces answer different
 * questions. `computeWatchlist` never returns `UpNextEntry`, and
 * `fetchWatchlistInputs` is never called by `fetchUpNextInputs`.
 */

/** One row exactly as one provider stated it, with that provider stamped on. */
export interface WatchlistInput {
  item: NormalizedMediaItem;
  /**
   * Which provider's read produced this row. Stamped at the gather boundary
   * (`state/queries/watchlist.ts`) because nothing downstream can re-derive it
   * — and the removal verb routes off it (R35).
   */
  source: ProviderId;
  /**
   * When the provider says the item was added (Trakt's `listed_at`). Absent
   * where the read carries no add-time: the Letterboxd scrape has none, and
   * AniList's `createdAt` is not selected by the shared list read this leg
   * slices for free. Undated rows sort last, stably (KTD-11).
   */
  addedAt?: string;
  /**
   * AniList's `MediaList.id`, carried through for the removal path. **A hint,
   * never evidence** — see the field's docblock on `AniListCurrentEntry`
   * (plan 0031 R36): a removal guards on a fresh in-effect read and deletes by
   * *that* read's id, never this cached one.
   */
  entryId?: number;
}

/** Every connected provider's rows plus whichever legs failed (R29). */
export interface WatchlistInputs {
  inputs: WatchlistInput[];
  /**
   * Legs that rejected. The grid renders the rows it has plus one inline
   * notice per failed provider (KTD-12), and the removal path reads this to
   * tell "known absent" from "unknown" membership (R35).
   */
  errors: ProviderFailure[];
  /**
   * Legs that **succeeded but did not read the whole watchlist** — today only
   * Letterboxd, whose scrape is paginated behind the grid's `onEndReached` and
   * is deliberately never auto-paged (22 sequential fetches per gather is the
   * cost R27's scope boundary rules out).
   *
   * Separate from `errors` because it is not a failure: nothing is missing that
   * the user asked for, the grid renders normally and **no inline notice
   * fires**. It exists for R35 alone. "A healthy leg that did not return this
   * item" is only evidence of non-membership when the leg actually *looked* at
   * the whole list, and a leg stopped at page 1 never looked — so a film on an
   * unfetched page would otherwise be reported as known-absent, silently
   * dropping its provider from a removal and letting the settled `Removed`
   * label assert a completeness that is false. That is the exact claim R35
   * forbids, and it gets worse rather than better when Letterboxd's removal
   * flips from `'manual'` to `'write'` after U6's spike.
   */
  incomplete: ProviderId[];
}

/**
 * One item on the user's watchlist, merged across every provider holding it
 * (R27). **A merge, not a suppression** — the one place this deliberately
 * differs from Up Next's `dedupeByTmdb`: both providers are equally true
 * statements about the same film, so a collision collapses into one row that
 * remembers everyone who contributed to it.
 */
export interface WatchlistEntry {
  /** Stable list key — the precedence winner's id. */
  id: string;
  /** The precedence winner: AniList for anime, then Trakt, then Letterboxd. */
  item: NormalizedMediaItem;
  /** Every provider holding it, in registry order. Removal routes off this. */
  sources: ProviderId[];
  /**
   * Every contributing item id (`trakt-123`, `letterboxd-slug`, …). Hidden ids
   * are provider-scoped, so the hide filter must run over **all** of them or a
   * film hidden from a Letterboxd row reappears as its Trakt twin (R30).
   */
  sourceIds: string[];
  /** The most recent add-time any contributing provider stated; absent sorts last. */
  addedAt?: string;
}
