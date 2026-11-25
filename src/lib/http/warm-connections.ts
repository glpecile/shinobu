import { prefetch, prefetchOnAppStart } from 'react-native-nitro-fetch';

import { ANILIST_GRAPHQL_URL } from '@/lib/providers/anilist/http';
import { providersForFeed } from '@/lib/providers/routing';
import { SIMKL_API_BASE_URL } from '@/lib/providers/simkl/config';
import { TMDB_API_BASE_URL } from '@/lib/providers/tmdb/config';
import { TRAKT_API_BASE_URL } from '@/lib/providers/trakt/config';
import type { ProviderId } from '@/lib/providers/types';

/**
 * Warm provider connections before Up Next starts its request chain. Native transport pools
 * them for the subsequent reads.
 */
const HOST_ROOTS: Record<ProviderId, string | null> = {
  trakt: `${TRAKT_API_BASE_URL}/`,
  anilist: ANILIST_GRAPHQL_URL,
  // Not Up Next request sources, but every detail screen hits TMDB, and
  // Letterboxd/Serializd reads warm on their own paths — kept null here so this
  // stays scoped to the hosts the home waterfall actually races against.
  letterboxd: null,
  serializd: null,
  // Simkl's Up Next legs landed with plan 0034 U7/U8: the all-items reads
  // (watching + plantowatch) hit the API host inside the same waterfall as the
  // Trakt/AniList reads. The calendar leg rides the CDN (data.simkl.in)
  // instead and stays unwarmed — one throwaway request per provider, aimed at
  // the host the waterfall races against first.
  simkl: `${SIMKL_API_BASE_URL}/`,
  hardcover: null,
};

const ALWAYS_WARM = [`${TMDB_API_BASE_URL}/`];

let warmed = false;

export function warmProviderConnections(connected: readonly ProviderId[]): void {
  if (warmed) return;
  warmed = true;

  const hosts = [
    ...providersForFeed(connected)
      .map((id) => HOST_ROOTS[id])
      .filter((url): url is string => url != null),
    ...ALWAYS_WARM,
  ];

  for (const url of hosts) {
    const prefetchKey = `warm:${url}`;
    // Best-effort: a rejected warmup must never surface. The connection is
    // pooled by the native layer whether the throwaway request 200s or 404s.
    void prefetch(url, { headers: { prefetchKey } }).catch(() => {});
    void prefetchOnAppStart(url, { prefetchKey }).catch(() => {});
  }
}
