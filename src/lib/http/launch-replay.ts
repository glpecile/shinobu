import { AppState } from 'react-native';
import { createMMKV, type MMKV } from 'react-native-mmkv';
import { prefetchOnAppStart, removeFromAutoPrefetch } from 'react-native-nitro-fetch';

import { ANILIST_GRAPHQL_URL } from '@/lib/providers/anilist/http';
import { SIMKL_API_BASE_URL, SIMKL_CDN_BASE_URL } from '@/lib/providers/simkl/config';
import { TMDB_API_BASE_URL } from '@/lib/providers/tmdb/config';
import { TRAKT_API_BASE_URL } from '@/lib/providers/trakt/config';
import type { HttpFetch } from '@/lib/http/types';
import { isTokenKey, onSessionChange } from '@/state/session/tokens';

/**
 * Replays a launch's provider reads natively on the next cold start, so Home's
 * revalidation finds its responses ready, or in flight, by the time JS asks.
 *
 * Reads that succeed in the first seconds of a foreground launch are
 * registered with `prefetchOnAppStart`, keyed by a hash of the whole request.
 * Each session's first identical read claims the native response; a different
 * token, body or URL hashes to a different key and goes to the network. The
 * queue is encrypted at rest because entries carry `Authorization`.
 */

const RECORD_WINDOW_MS = 10_000;
const MAX_REPLAYS = 20;
// The replay starts at process start. An older response belongs to a launch
// the user didn't open into, such as a background task.
const REPLAY_TTL_MS = 60_000;
const STORED_KEYS = 'keys';

interface Replay {
  key: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

const startedAt = Date.now();
const claimed = new Set<string>();
const recorded = new Map<string, Replay>();
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let cache: MMKV | undefined;

function storage(): MMKV {
  cache ??= createMMKV({ id: 'launch-replay' });
  return cache;
}

/** cyrb53: a fast synchronous string hash; keys only need to differ per request. */
function hash(value: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function isGraphqlQuery(body: string): boolean {
  try {
    const { query } = JSON.parse(body) as { query?: unknown };
    return typeof query === 'string' && !/^\s*mutation\b/.test(query);
  } catch {
    return false;
  }
}

/**
 * Idempotent reads only. Simkl's API host replays just `/sync/activities`:
 * `/sync/all-items` must stay gated on it (docs/solutions/simkl-rate-limits-and-write-lock.md).
 */
function isReplayable(url: string, method: string, body: string | undefined): boolean {
  if (method === 'POST') return url === ANILIST_GRAPHQL_URL && body != null && isGraphqlQuery(body);
  if (method !== 'GET') return false;
  if (url.startsWith(`${SIMKL_API_BASE_URL}/`)) return new URL(url).pathname === '/sync/activities';
  return [TRAKT_API_BASE_URL, TMDB_API_BASE_URL, SIMKL_CDN_BASE_URL].some((base) =>
    url.startsWith(`${base}/`),
  );
}

export function replayFor(input: RequestInfo | URL, init?: RequestInit): Replay | null {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : null;
  const method = (init?.method ?? 'GET').toUpperCase();
  const body = init?.body == null ? undefined : typeof init.body === 'string' ? init.body : null;
  if (url == null || body === null || !isReplayable(url, method, body)) return null;
  const headers = Object.fromEntries(new Headers(init?.headers).entries());
  return { key: `launch:${hash(JSON.stringify([method, url, headers, body]))}`, url, method, headers, ...(body != null ? { body } : {}) };
}

function persist() {
  persistTimer = undefined;
  const previous = JSON.parse(storage().getString(STORED_KEYS) ?? '[]') as string[];
  for (const key of previous) {
    if (!recorded.has(key)) void removeFromAutoPrefetch(key);
  }
  for (const { key, url, ...request } of recorded.values()) {
    void prefetchOnAppStart(url, { ...request, prefetchKey: key, prefetchCacheTtlMs: REPLAY_TTL_MS } as RequestInit).catch(() => {});
  }
  storage().set(STORED_KEYS, JSON.stringify([...recorded.keys()]));
}

function record(replay: Replay) {
  if (AppState.currentState !== 'active' || recorded.size >= MAX_REPLAYS) return;
  const remaining = startedAt + RECORD_WINDOW_MS - Date.now();
  if (remaining <= 0) return;
  recorded.set(replay.key, replay);
  persistTimer ??= setTimeout(persist, remaining);
}

/** `fetch` with the launch replay claimed and the launch's reads recorded. */
export function fetchWithLaunchReplay(fetch: HttpFetch, input: RequestInfo | URL, init?: RequestInit) {
  const replay = replayFor(input, init);
  if (replay == null) return fetch(input, init);
  const claim = !claimed.has(replay.key);
  claimed.add(replay.key);
  const response = fetch(
    input,
    claim
      ? ({ ...init, headers: { ...replay.headers, prefetchKey: replay.key }, prefetchCacheTtlMs: REPLAY_TTL_MS } as RequestInit)
      : init,
  );
  void response.then((res) => {
    if (res.ok) record(replay);
  }, () => {});
  return response;
}

// Recorded reads carry the token they were sent with. A changed or removed
// token takes them out of the native queue; the next launch records afresh.
onSessionChange((key) => {
  if (isTokenKey(key)) forget();
});

function forget() {
  recorded.clear();
  if (persistTimer !== undefined) clearTimeout(persistTimer);
  persistTimer = undefined;
  const keys = JSON.parse(storage().getString(STORED_KEYS) ?? '[]') as string[];
  for (const key of keys) void removeFromAutoPrefetch(key);
  storage().remove(STORED_KEYS);
}
