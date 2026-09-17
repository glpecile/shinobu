import { describe, expect, test } from 'bun:test';

import { sheetScrollMetrics } from './metrics';

const CAP = 800;

describe('sheetScrollMetrics', () => {
  test('an unmeasured sheet gets no height and cannot scroll', () => {
    expect(sheetScrollMetrics(null, CAP)).toEqual({
      height: undefined,
      scrollEnabled: false,
    });
  });

  test('short content hugs — the sheet is exactly its content', () => {
    expect(sheetScrollMetrics(240, CAP)).toEqual({
      height: 240,
      scrollEnabled: false,
    });
  });

  test('content at the cap still does not scroll', () => {
    expect(sheetScrollMetrics(CAP, CAP)).toEqual({
      height: CAP,
      scrollEnabled: false,
    });
  });

  test('taller content pins to the cap and scrolls', () => {
    expect(sheetScrollMetrics(2400, CAP)).toEqual({
      height: CAP,
      scrollEnabled: true,
    });
  });
});
