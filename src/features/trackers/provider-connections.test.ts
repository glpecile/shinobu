import { describe, expect, test } from 'bun:test';

import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';

import { splitProviders } from './provider-connections';

const REGISTRY_ORDER = Object.keys(PROVIDERS) as ProviderId[];

describe('splitProviders', () => {
  test('a fresh install puts every provider under Accounts', () => {
    const split = splitProviders([]);
    expect(split.connected).toEqual([]);
    expect(split.disconnected).toEqual(REGISTRY_ORDER);
  });

  test('two connected split 2/2 without dropping or duplicating any', () => {
    const split = splitProviders(['anilist', 'trakt']);
    expect(split.connected).toHaveLength(2);
    expect(split.disconnected).toHaveLength(REGISTRY_ORDER.length - 2);
    // Hermes has no toSorted (docs/solutions/hermes-no-es2023-array-methods.md).
    expect([...split.connected, ...split.disconnected].sort()).toEqual(
      [...REGISTRY_ORDER].sort(),
    );
  });

  test('both halves follow registry order, not connection order', () => {
    // MMKV enumerates session keys in the order they were written, so this
    // input is deliberately reversed relative to the registry.
    const split = splitProviders(['anilist', 'trakt']);
    expect(split.connected).toEqual(
      REGISTRY_ORDER.filter((id) => id === 'trakt' || id === 'anilist'),
    );
    expect(split.disconnected).toEqual(
      REGISTRY_ORDER.filter((id) => id !== 'trakt' && id !== 'anilist'),
    );
  });

  test('all connected leaves Accounts empty', () => {
    const split = splitProviders(REGISTRY_ORDER);
    expect(split.connected).toEqual(REGISTRY_ORDER);
    expect(split.disconnected).toEqual([]);
  });
});
