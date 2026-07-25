import { describe, expect, test } from 'bun:test';

import { capFeedRow, FEED_ROW_ITEM_CAP } from './row-cap';

describe('capFeedRow', () => {
  test('caps a long row at the feed cap, order preserved', () => {
    const items = Array.from({ length: 250 }, (_, index) => index);
    const capped = capFeedRow(items);

    expect(capped).toHaveLength(FEED_ROW_ITEM_CAP);
    expect(capped[0]).toBe(0);
    expect(capped.at(-1)).toBe(FEED_ROW_ITEM_CAP - 1);
  });

  test('leaves a short row alone, by identity', () => {
    const items = [1, 2, 3];
    expect(capFeedRow(items)).toBe(items);
  });

  test('keeps an exactly-cap-length row by identity too', () => {
    const items = Array.from({ length: FEED_ROW_ITEM_CAP }, (_, i) => i);
    expect(capFeedRow(items)).toBe(items);
  });
});
