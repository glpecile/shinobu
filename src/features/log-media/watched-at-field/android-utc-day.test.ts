import { describe, expect, test } from 'bun:test';

import { fromPickerValue, toPickerValue } from './android-utc-day';

describe('android-utc-day', () => {
  test('fromPickerValue keeps the picked calendar day in local time', () => {
    // What Compose emits for "Sept 5": UTC midnight.
    const picked = new Date(Date.UTC(2026, 8, 5));
    const local = fromPickerValue(picked, new Date(2026, 8, 7, 21, 30));
    expect([local.getFullYear(), local.getMonth(), local.getDate()]).toEqual([2026, 8, 5]);
    expect([local.getHours(), local.getMinutes()]).toEqual([21, 30]);
  });

  test('toPickerValue maps a local day to its UTC-midnight millis', () => {
    const value = toPickerValue(new Date(2026, 8, 7, 23, 59));
    expect(value.getTime()).toBe(Date.UTC(2026, 8, 7));
  });

  test('round-trips regardless of host timezone', () => {
    const local = new Date(2026, 0, 1, 0, 5);
    const back = fromPickerValue(toPickerValue(local), local);
    expect(back.getTime()).toBe(local.getTime());
  });
});
