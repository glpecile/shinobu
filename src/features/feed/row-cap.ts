export const FEED_ROW_ITEM_CAP = 30;

export function capFeedRow<T>(items: readonly T[]): readonly T[] {
  return items.length <= FEED_ROW_ITEM_CAP ? items : items.slice(0, FEED_ROW_ITEM_CAP);
}
