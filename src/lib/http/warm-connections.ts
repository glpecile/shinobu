import { prefetch, prefetchOnAppStart } from 'react-native-nitro-fetch';

import { ANILIST_GRAPHQL_URL } from '@/lib/providers/anilist/http';
import { providersForFeed } from '@/lib/providers/routing';
import { SIMKL_API_BASE_URL } from '@/lib/providers/simkl/config';
import { TMDB_API_BASE_URL } from '@/lib/providers/tmdb/config';
import { TRAKT_API_BASE_URL } from '@/lib/providers/trakt/config';
import type { ProviderId } from '@/lib/providers/types';

/**
 * Warm the TLS/HTTP2 connection to each provider host *before* the Up Next
 * request waterfall fires. That waterfall (`fetchUpNextInputs`) opens with
 * per-provider list reads (Trakt, Simkl's all-items pair, AniList), then fans
 * out up to 20 per-show progress reads — every one to a host that, cold, pays a full
 * TCP + TLS handshake. nitro-fetch (Cronet on Android, URLSession on iOS) pools
 * connections per host, so a single throwaway request opens the pipe the real
 * reads then reuse.
 *
 * Two mechanisms, both native-only (the web sibling is a no-op):
 *   - `prefetch` warms the pool *this* session, as early as the home screen
 *     mounts — a beat before TanStack fires the real queries.
 *   - `prefetchOnAppStart` registers a persistent native prewarm that runs at
 *     *process* start on the next launch, before JS even boots, so a returning
 *     user's first Up Next load never pays the handshake at all.
 *
 * The requests hit each host root with no auth; a 4xx/redirect back is fine —
 * the connection is warmed regardless, and the response is discarded. Only
 * connected providers are warmed, and only once per session.
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
};

// TMDB backs every detail screen the user taps into from the feed, so warming
// it alongside the trackers pays off on the very next navigation.
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
    // Best-effort: a rejected warmup must never surface. The connection is
    // pooled by the native layer whether the throwaway request 200s or 404s.
    void prefetch(url).catch(() => {});
    void prefetchOnAppStart(url, { prefetchKey: `warm:${url}` }).catch(() => {});
  }
}
