import { describe, expect, test } from 'bun:test';

import {
  emitTabPress,
  onTabDoubleTap,
  TAB_DOUBLE_TAP_MS,
} from './tab-double-tap';

/**
 * Each test uses its own tab name: the press window is module state (one
 * window shared by the whole app, which is the point), so reusing a name
 * would let one test's last press pair with the next test's first.
 */

/** Collects the tabs that fired into `seen`; returns the unsubscribe. */
function subscribe(seen: string[]): () => void {
  return onTabDoubleTap((tab) => seen.push(tab));
}

describe('emitTabPress', () => {
  test('a single press fires nothing', () => {
    const seen: string[] = [];
    const stop = subscribe(seen);
    emitTabPress('single', 0);
    stop();
    expect(seen).toEqual([]);
  });

  test('two presses inside the window are a double tap', () => {
    const seen: string[] = [];
    const stop = subscribe(seen);
    emitTabPress('fast', 0);
    emitTabPress('fast', 200);
    stop();
    expect(seen).toEqual(['fast']);
  });

  test('two slow presses are two single taps', () => {
    const seen: string[] = [];
    const stop = subscribe(seen);
    emitTabPress('slow', 0);
    emitTabPress('slow', TAB_DOUBLE_TAP_MS);
    stop();
    expect(seen).toEqual([]);
  });

  test('two different tabs are never a double tap', () => {
    // Bouncing between Home and Diary is two intents, not a refresh.
    const seen: string[] = [];
    const stop = subscribe(seen);
    emitTabPress('home', 0);
    emitTabPress('log', 100);
    stop();
    expect(seen).toEqual([]);
  });

  test('a triple tap fires once, not twice', () => {
    const seen: string[] = [];
    const stop = subscribe(seen);
    emitTabPress('triple', 0);
    emitTabPress('triple', 100);
    emitTabPress('triple', 200);
    stop();
    expect(seen).toEqual(['triple']);
  });
});
