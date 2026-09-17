import { describe, expect, test } from 'bun:test';

import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';

import {
  shouldAutoCloseSheet,
  splitProviders,
} from './provider-connections';

const REGISTRY_ORDER = Object.keys(PROVIDERS) as ProviderId[];

describe('splitProviders', () => {

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

});

describe('shouldAutoCloseSheet', () => {
  const base = {
    open: true,
    sheetId: 'serializd' as ProviderId,
    openedConnected: false,
    connectedIds: [] as ProviderId[],
  };

  test('closes once the provider it was opened to connect is connected', () => {
    expect(
      shouldAutoCloseSheet({ ...base, connectedIds: ['serializd'] }),
    ).toBe(true);
  });

  test('stays open while that provider is still disconnected', () => {
    expect(shouldAutoCloseSheet({ ...base, connectedIds: ['trakt'] })).toBe(
      false,
    );
  });

  test('a sheet opened on an already-connected provider never self-closes', () => {
    // Otherwise opening Serializd to *disconnect* it would dismiss instantly.
    expect(
      shouldAutoCloseSheet({
        ...base,
        openedConnected: true,
        connectedIds: ['serializd'],
      }),
    ).toBe(false);
  });

  test('a closed sheet is left alone', () => {
    expect(
      shouldAutoCloseSheet({
        ...base,
        open: false,
        connectedIds: ['serializd'],
      }),
    ).toBe(false);
  });

  test('no provider, nothing to close', () => {
    expect(
      shouldAutoCloseSheet({
        ...base,
        sheetId: null,
        connectedIds: ['serializd'],
      }),
    ).toBe(false);
  });
});
