import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import { ProviderAuthError } from '@/lib/providers/errors';
import { loginToSerializd, validateAuthToken } from './auth';
import type { SerializdDeps } from './deps';

function deps(handler: (url: string, init?: RequestInit) => Response): SerializdDeps {
  return {
    baseUrl: 'https://api.test',
    fetch: async (input, init) => handler(String(input), init),
  };
}

describe('loginToSerializd', () => {
  test('parses the flat { token, username } shape', async () => {
    const result = await Effect.runPromise(
      loginToSerializd(
        deps(() => Response.json({ token: 'tok-1', username: 'gian' })),
        { email: 'a@b.co', password: 'pw' },
      ),
    );
    expect(result).toEqual({ token: 'tok-1', username: 'gian' });
  });

  test('parses the nested { token, user: { username } } shape', async () => {
    const result = await Effect.runPromise(
      loginToSerializd(
        deps(() => Response.json({ token: 'tok-2', user: { username: 'nina' } })),
        { email: 'a@b.co', password: 'pw' },
      ),
    );
    expect(result).toEqual({ token: 'tok-2', username: 'nina' });
  });

  test('surfaces the API message on a bad credential without a token', async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        loginToSerializd(
          deps(() => Response.json({ message: 'Incorrect password' }, { status: 401 })),
          { email: 'a@b.co', password: 'nope' },
        ),
      ),
    );
    expect(error._tag).toBe('ProviderDecodeError');
    expect(error.message).toContain('Incorrect password');
  });
});

describe('validateAuthToken', () => {
  test('recovers the username for a valid token', async () => {
    const result = await Effect.runPromise(
      validateAuthToken(
        deps(() => Response.json({ isValid: true, username: 'gian' })),
        'tok-1',
      ),
    );
    expect(result).toEqual({ token: 'tok-1', username: 'gian' });
  });

  test('an invalid token is a reconnect auth error', async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        validateAuthToken(deps(() => Response.json({ isValid: false })), 'tok-x'),
      ),
    );
    expect(error).toBeInstanceOf(ProviderAuthError);
    expect(error._tag).toBe('ProviderAuthError');
  });
});
