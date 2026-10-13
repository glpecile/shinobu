import { describe, expect, test } from 'bun:test';

import { emitSearchFocusRequest, onSearchFocusRequest } from './focus-signal';

describe('search focus signal', () => {
  test('a live emission reaches the subscriber without replaying on remount', () => {
    let calls = 0;
    const unsubscribe = onSearchFocusRequest(() => {
      calls += 1;
    });

    emitSearchFocusRequest();
    unsubscribe();
    const unsubscribeAgain = onSearchFocusRequest(() => {
      calls += 1;
    });
    unsubscribeAgain();

    expect(calls).toBe(1);
  });

  test('an emission before subscribing fires once, on the first subscribe', () => {
    // The web tab press navigates before the search screen exists, so the
    // request waits for it — but StrictMode's remount must not replay it.
    emitSearchFocusRequest();

    let first = 0;
    const unsubscribeFirst = onSearchFocusRequest(() => {
      first += 1;
    });
    let second = 0;
    const unsubscribeSecond = onSearchFocusRequest(() => {
      second += 1;
    });
    unsubscribeFirst();
    unsubscribeSecond();

    expect(first).toBe(1);
    expect(second).toBe(0);
  });

  test('unsubscribing stops live emissions', () => {
    let calls = 0;
    const unsubscribe = onSearchFocusRequest(() => {
      calls += 1;
    });
    unsubscribe();

    emitSearchFocusRequest();

    expect(calls).toBe(0);
  });
});
