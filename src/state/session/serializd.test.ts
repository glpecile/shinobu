import { beforeEach, describe, expect, mock, test } from 'bun:test';

// react-native-mmkv is a native module that can't load under bun — back the
// session store with an in-memory Map so the connect/disconnect flow is testable.
const store = new Map<string, string>();
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => store.get(key),
    set: (key: string, value: string) => store.set(key, value),
    remove: (key: string) => store.delete(key),
    getAllKeys: () => [...store.keys()],
    addOnValueChangedListener: () => ({ remove() {} }),
  }),
}));

const { connectSerializd, getSerializdSession, getSerializdUsername } = await import(
  './serializd'
);
const {
  connectedProviderIds,
  clearProviderSession,
  getProviderSession,
  onProviderConnected,
} = await import('./tokens');

beforeEach(() => store.clear());

describe('connectSerializd', () => {
  test('stores the token + username under session.serializd', () => {
    connectSerializd({ accessToken: 'tok-1', username: 'gian' });
    expect(getProviderSession('serializd')).toMatchObject({
      accessToken: 'tok-1',
      username: 'gian',
    });
    expect(getSerializdUsername()).toBe('gian');
    expect(getSerializdSession()).toEqual({ accessToken: 'tok-1', username: 'gian' });
  });

  test('disconnect removes the key and getSerializdSession returns null', () => {
    connectSerializd({ accessToken: 'tok-1', username: 'gian' });
    clearProviderSession('serializd');
    expect(getSerializdSession()).toBeNull();
    expect(connectedProviderIds()).not.toContain('serializd');
  });

  test('announces a first connect, not an overwrite such as a token refresh', () => {
    const connected: string[] = [];
    onProviderConnected((id) => connected.push(id));
    connectSerializd({ accessToken: 'tok-1', username: 'gian' });
    connectSerializd({ accessToken: 'tok-2', username: 'gian' });
    expect(connected).toEqual(['serializd']);
  });

  test('a session missing the token or username is treated as disconnected', () => {
    connectSerializd({ accessToken: '', username: 'gian' });
    expect(getSerializdSession()).toBeNull();
  });
});
