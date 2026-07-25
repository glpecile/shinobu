/**
 * How many cards a home-feed carousel renders. The public trending rows have
 * always been bounded here by the provider itself (`getTrendingShows` asks for
 * 30); the personal rows were not — `getWatchedShows` pages up to 10 × 100, so
 * a heavy Trakt library mounted up to a thousand cards in one row, each firing
 * its own `useTraktMediaImages` request. Virtualization alone doesn't fix that
 * (plan 0024 KTD4): the row is *browse*, not an archive, so it is capped to
 * match the trending rows and the full library stays reachable through search
 * and the provider's own surfaces.
 */
export const FEED_ROW_ITEM_CAP = 30;

/** First `FEED_ROW_ITEM_CAP` items, order preserved; identity kept when it already fits. */
export function capFeedRow<T>(items: readonly T[]): readonly T[] {
  return items.length <= FEED_ROW_ITEM_CAP
    ? items
    : items.slice(0, FEED_ROW_ITEM_CAP);
}
