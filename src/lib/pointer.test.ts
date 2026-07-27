import { afterEach, describe, expect, test } from 'bun:test';

import { hasCoarsePointer } from './pointer';

const original = Reflect.getOwnPropertyDescriptor(globalThis, 'matchMedia');

function stubMatchMedia(value: ((query: string) => unknown) | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, 'matchMedia');
    return;
  }
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    value,
    writable: true,
  });
}

afterEach(() => {
  if (original === undefined) Reflect.deleteProperty(globalThis, 'matchMedia');
  else Object.defineProperty(globalThis, 'matchMedia', original);
});

describe('hasCoarsePointer', () => {
  test('is false when matchMedia is unavailable (native, and web SSR)', () => {
    stubMatchMedia(undefined);
    expect(hasCoarsePointer()).toBe(false);
  });

  test('is true when the browser reports a coarse primary pointer', () => {
    const queries: string[] = [];
    stubMatchMedia((query: string) => {
      queries.push(query);
      return { matches: true };
    });
    expect(hasCoarsePointer()).toBe(true);
    expect(queries).toEqual(['(pointer: coarse)']);
  });

  test('is false on a fine pointer (desktop keeps its autoFocus)', () => {
    stubMatchMedia(() => ({ matches: false }));
    expect(hasCoarsePointer()).toBe(false);
  });
});
