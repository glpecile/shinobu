import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { reloadOnStaleBundle } from './stale-bundle';

let reloads = 0;
let online = true;
const stored = new Map<string, string>();
const realNavigator = Reflect.getOwnPropertyDescriptor(globalThis, 'navigator');

function staleChunkError(): Error {
  const error = new Error('Loading module failed');
  error.name = 'AsyncRequireError';
  return error;
}

beforeEach(() => {
  reloads = 0;
  online = true;
  stored.clear();
  process.env.EXPO_OS = 'web';
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { reload: () => { reloads += 1; } },
      sessionStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
      },
    },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { get onLine() { return online; } },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
  if (realNavigator != null) Object.defineProperty(globalThis, 'navigator', realNavigator);
  process.env.EXPO_OS = 'ios';
});

describe('reloadOnStaleBundle', () => {
  test('reloads once, then lets a second failure in the window show the fallback', () => {
    reloadOnStaleBundle(staleChunkError());
    reloadOnStaleBundle(staleChunkError());
    expect(reloads).toBe(1);
  });

  test('does not reload offline, where the chunk failed on the network', () => {
    online = false;
    reloadOnStaleBundle(staleChunkError());
    expect(reloads).toBe(0);
  });
});
