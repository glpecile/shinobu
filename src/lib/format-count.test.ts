import { expect, test } from 'bun:test';

import { formatCount } from './format-count';

test('compact counts keep their unit until its threshold is reached', () => {
  for (const [count, expected] of [
    [0, '0'], [999, '999'], [40_552, '40.6K'], [950_000, '950K'],
    [1_000_000, '1M'], [950_000_000, '950M'], [1_000_000_000, '1B'],
  ] as const) {
    expect(formatCount(count)).toBe(expected);
  }
});
