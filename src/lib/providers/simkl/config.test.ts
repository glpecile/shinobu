import { afterEach, describe, expect, test } from 'bun:test';

import {
  SIMKL_API_BASE_URL,
  SIMKL_AUTHORIZE_URL,
  SIMKL_CDN_BASE_URL,
  simklClientId,
  simklStandardParams,
} from './config';

const ENV_KEY = 'EXPO_PUBLIC_SIMKL_CLIENT_ID';
const original = process.env[ENV_KEY];

afterEach(() => {
  if (original == null) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = original;
  }
});

describe('simkl config', () => {
  test('base URLs match the documented hosts', () => {
    expect(SIMKL_API_BASE_URL).toBe('https://api.simkl.com');
    expect(SIMKL_CDN_BASE_URL).toBe('https://data.simkl.in');
    expect(SIMKL_AUTHORIZE_URL).toBe('https://simkl.com/oauth/authorize');
  });

  test('simklClientId reads the env var and falls back to empty string', () => {
    process.env[ENV_KEY] = 'cid-from-env';
    expect(simklClientId()).toBe('cid-from-env');
    delete process.env[ENV_KEY];
    expect(simklClientId()).toBe('');
  });

  test('simklStandardParams carries the three mandatory URL params', () => {
    const params = simklStandardParams('cid-1');
    expect(params.client_id).toBe('cid-1');
    expect(params['app-name']).toBe('shinobu');
    expect(params['app-version']).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
