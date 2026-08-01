import type { QueryClient } from '@tanstack/react-query';

import { hasAired, parseLocalInstant } from '@/lib/time/has-aired';
import type { ProviderId } from '@/lib/providers/types';
import { anilistQueryKeys } from '@/state/queries/anilist';
import { letterboxdQueryKeys } from '@/state/queries/letterboxd';
import { serializdQueryKeys } from '@/state/queries/serializd';
import { simklQueryKeys } from '@/state/queries/simkl';
import { traktQueryKeys } from '@/state/queries/trakt';
import { upNextQueryKeys } from '@/state/queries/up-next';
import { watchlistQueryKeys } from '@/state/queries/watchlist';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { getSerializdUsername } from '@/state/session/serializd';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * The watchlist add's invalidation half (plan 0031 KTD-5/R19). A sibling of
 * `invalidateAfterLog` rather than a branch inside it: that function is 68
 * lines of *watch-history* keys — watched shows, history, per-show progress,
 * diary — of which a watchlist add touches almost none.
 *
 * Runs on the **enriched** item and inside `mutationFn`, never `onSuccess`
 * (see `use-watchlist-media.ts` for the second, plan-0031-specific reason).
 *
 * **The removal verb reuses this body with the same key list** (U16/R38): every
 * key here answers "what does this provider say is on the watchlist", and that
 * answer changes identically whichever direction the write went. There is no
 * optimistic counterpart to pair it with (KTD-5) — the row leaves the grid when
 * the refetch these invalidations schedule lands, not before.
 */
export function invalidateAfterWatchlist(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
  succeeded: readonly ProviderId[],
) {
  if (succeeded.includes('trakt')) {
    // A watchlisted show/film enters `/calendars/my/*` — but the write cannot
    // know the window the read keyed itself by, so this is the prefix builder
    // (KTD-5), never `myCalendar(type, startDate, days)`.
    queryClient.invalidateQueries({ queryKey: traktQueryKeys.myCalendarRoot() });
    // The watchlist read itself, as a prefix: the gather asks for
    // `watchlist('all', 'added', 'desc')` today, and an add must not have to
    // know that key's sort arguments to refresh it.
    queryClient.invalidateQueries({ queryKey: traktQueryKeys.watchlistRoot() });
  }
  if (succeeded.includes('anilist')) {
    // `currentAnime` derives from `currentAnimeEntries` — invalidating only the
    // derived key refetches it straight off a stale entries cache (the exact
    // trap `invalidateAfterLog` documents). Both, always.
    queryClient.invalidateQueries({ queryKey: anilistQueryKeys.currentAnimeEntries() });
    queryClient.invalidateQueries({ queryKey: anilistQueryKeys.currentAnime() });
    // The third derived key over that same entries read — the PLANNING slice
    // the watchlist surface renders. It inherits the identical trap, which is
    // why the entries key above is invalidated first.
    queryClient.invalidateQueries({ queryKey: anilistQueryKeys.plannedAnime() });
    const mediaId = item.externalIds.anilist;
    if (mediaId != null) {
      // KTD-2's exclusive-status guard reads this before the next write; a
      // stale copy would let it mis-fire.
      queryClient.invalidateQueries({ queryKey: anilistQueryKeys.entryState(mediaId) });
    }
  }
  if (succeeded.includes('letterboxd')) {
    const username = getLetterboxdUsername();
    if (username != null) {
      // Two separately-keyed reads of the same list — the feed row's single
      // page and the paginated "View all" grid. Refetching one never refreshes
      // the other, so a watchlist add must name both.
      queryClient.invalidateQueries({ queryKey: letterboxdQueryKeys.watchlist(username) });
      queryClient.invalidateQueries({
        queryKey: letterboxdQueryKeys.watchlistPages(username),
      });
    }
  }
  if (succeeded.includes('serializd')) {
    // No Serializd watchlist *read* exists in the app *yet* — the endpoint does
    // (`user/{username}/watchlistpage_v2/{page}`, R32), it is simply out of v1,
    // so this entry is a TODO rather than a claim of non-existence. What must
    // refresh today is the progress key the watched/watchlisted guard reads:
    // the write changes what that guard would next observe.
    const username = getSerializdUsername();
    const tmdbId = item.externalIds.tmdb;
    if (username != null && tmdbId != null) {
      queryClient.invalidateQueries({
        queryKey: serializdQueryKeys.progress(username, tmdbId),
      });
    }
  }
  if (succeeded.includes('simkl')) {
    // `add-to-list` moved the item into the plantowatch bucket — the cached
    // all-items filters (the prefix, since a write can't know which
    // type/status a surface requested) and the activities delta gating their
    // refetch are both stale (plan 0034 KTD-5). Since U7 flipped `canRead`,
    // the unified feed, the watchlist gather and Up Next's Simkl legs all read
    // off these keys — a stale copy would surface the add late on every one.
    queryClient.invalidateQueries({ queryKey: simklQueryKeys.allItemsRoot() });
    queryClient.invalidateQueries({ queryKey: simklQueryKeys.activities() });
  }
  // Then, and only then, the gatherer. Invalidating it alone would re-serve the
  // provider payloads above from cache for up to 15 minutes; invalidating the
  // provider keys alone would leave the agenda computed from a stale gather.
  if (succeeded.length > 0) {
    queryClient.invalidateQueries({ queryKey: upNextQueryKeys.inputs() });
    // And the surface the add was built to land on (plan 0031 U14). Registered
    // by the unit that creates the key, like every other entry here — without
    // it a successful add sits invisible behind the gather's 15-minute stale
    // window on the one screen that exists to show it.
    queryClient.invalidateQueries({ queryKey: watchlistQueryKeys.inputs() });
  }
  // The gather key *is* persisted (plan 0031 U13 added it to
  // `PERSISTED_PREFIXES`), but invalidating it changes no *shape*: its value is
  // arrays all the way down, with no `Set` to corrupt on rehydration
  // (docs/solutions/persisted-query-cache-set-and-map-corruption.md), so there is still
  // no cache-version BUSTER to bump here.
}

/** Matches Up Next's Calendar window and `compute-schedule`'s (plan 0030 R1). */
const NOTIFICATION_WINDOW_DAYS = 7;
const NOTIFICATION_WINDOW_MS = NOTIFICATION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Every instant a `NormalizedMediaItem` states about itself, in the same
 * "instant or bare calendar date" contract `entryInstant` returns for an
 * `UpNextEntry` — the show's/film's first release, plus a film's per-kind
 * release calendar, because Calendar sources both `/calendars/my/movies` and
 * `/calendars/my/streaming` and a digital date is a real agenda row.
 */
function itemInstants(item: NormalizedMediaItem): string[] {
  return [
    item.releaseDate,
    item.releaseCalendar?.theatrical,
    item.releaseCalendar?.digital,
    item.releaseCalendar?.physical,
  ].filter((value): value is string => value != null && value !== '');
}

/**
 * Whether a successful add — or, on the same gate, a successful removal (U16) —
 * can plausibly change the local notification schedule (R19/R20). The gate on
 * `refreshNotifications`.
 *
 * That call is a **full `fetchUpNextInputs` regather** (`refresh.ts` calls the
 * gather function directly, not the cached `inputs()` query) against keys the
 * step above just invalidated: watched shows + up to 20 show-progress reads + 3
 * calendar windows + AniList + Letterboxd. Firing it with `throttle: false` —
 * deliberately bypassing the 15-minute `THROTTLE_MS` that exists to prevent
 * exactly this — is only justified when the schedule genuinely can have moved.
 *
 * Judged with the same `hasAired`/`parseLocalInstant` helpers Up Next uses, on
 * the same today…today+6 window: a genuinely old film (the 1997 case) has
 * nothing to place, so it pays nothing; a film already out theatrically whose
 * *digital* release lands next Tuesday does, and its appearing on the agenda is
 * correct plan-0030 behaviour rather than a regression.
 *
 * Known and accepted narrowness: a mid-run *series* states only its first air
 * date, so adding it does not trigger a refresh even though its next episode
 * may land inside the window. The throttled foreground path picks that up —
 * paying a full regather on every such tap is the cost R19 rejects.
 */
export function shouldRefreshNotifications(
  item: NormalizedMediaItem,
  platform: string,
  now: Date = new Date(),
): boolean {
  // Local notifications do not exist on web (serverless web push doesn't
  // exist) — `refreshNotifications` would no-op, so don't even build its deps.
  if (platform === 'web') return false;
  const horizon = now.getTime() + NOTIFICATION_WINDOW_MS;
  return itemInstants(item).some((value) => {
    if (hasAired(value, now)) return false;
    const instant = parseLocalInstant(value);
    return instant != null && instant.getTime() <= horizon;
  });
}
