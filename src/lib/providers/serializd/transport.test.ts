import { describe, expect, test } from 'bun:test';

import type { HttpFetch } from '@/lib/http/types';
import {
  SERIALIZD_UPSTREAM_BASE_URL,
  SERIALIZD_WEB_PROXY_BASE_URL,
} from './config';
import { withSerializdAppHeaders } from './transport-headers';

// The platform transport files (transport.ts / transport.web.ts) import the
// native nitro client, which can't load under bun test — so this exercises the
// pure header/url composition (the part with real logic) directly.

describe('native transport header composition', () => {
  test('adds the three app headers and preserves caller headers', async () => {
    let seen: { url: string; headers: Record<string, string> } | undefined;
    const base: HttpFetch = async (input, init) => {
      seen = { url: String(input), headers: init?.headers as Record<string, string> };
      return new Response('{}');
    };

    const fetch = withSerializdAppHeaders(base);
    await fetch(`${SERIALIZD_UPSTREAM_BASE_URL}/show/1396`, {
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
    });

    expect(seen?.url).toBe(`${SERIALIZD_UPSTREAM_BASE_URL}/show/1396`);
    expect(seen?.headers).toMatchObject({
      Origin: 'https://www.serializd.com',
      Referer: 'https://www.serializd.com',
      'X-Requested-With': 'serializd_vercel',
      // Caller headers survive the wrap — Authorization attaches on the native path.
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok',
    });
  });
});

describe('web transport base url', () => {
  test('targets the same-origin proxy path (no upstream host, no spoofed headers)', () => {
    // The web transport uses plain fetch and adds no app headers — the proxy
    // owns them. Its only distinguishing config is the base path.
    expect(SERIALIZD_WEB_PROXY_BASE_URL).toBe('/api/serializd');
    expect(SERIALIZD_UPSTREAM_BASE_URL.startsWith('https://')).toBe(true);
  });
});
