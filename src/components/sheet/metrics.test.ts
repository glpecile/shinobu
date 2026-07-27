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

  test('shrinking back below the cap hugs again', () => {
    // The measurement stays live inside the scroller, so a sheet that collapses
    // a section (the log sheet's tag picker) must return to hugging rather than
    // sitting at the cap with dead space under its buttons.
    expect(sheetScrollMetrics(2400, CAP).height).toBe(CAP);
    expect(sheetScrollMetrics(300, CAP)).toEqual({
      height: 300,
      scrollEnabled: false,
    });
  });
});
