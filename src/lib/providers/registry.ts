import type { ProviderDescriptor, ProviderId } from './types';

/**
 * The single provider registry. Routing (routing.ts) derives everything from
 * these declarations — adding or degrading a provider happens here, never via
 * scattered `if (provider === ...)` checks.
 */
export const PROVIDERS: Record<ProviderId, ProviderDescriptor> = {
  trakt: {
    id: 'trakt',
    label: 'Trakt',
    mediaTypes: ['TV', 'MOVIE'],
    canRead: true,
    canWrite: true,
  },
  anilist: {
    id: 'anilist',
    label: 'AniList',
    mediaTypes: ['ANIME', 'MANGA'],
    canRead: true,
    canWrite: true,
  },
  // No official API (todos/004, plan 0012). Reads scrape the public watchlist
  // (native-only on web — docs/solutions/web-cors-letterboxd.md). canWrite is
  // ON: movies log as diary entries via the captured signed-in web session
  // (the CSV path was rejected 2026-07-15). Writes need that session, which
  // only the native sign-in WebView captures — a movie logged before Letterboxd
  // is connected on mobile surfaces a per-provider "reconnect" failure, exactly
  // the partial-failure contract in AGENTS.md, not a silent drop.
  letterboxd: {
    id: 'letterboxd',
    label: 'Letterboxd',
    mediaTypes: ['MOVIE'],
    canRead: true,
    canWrite: true,
    // The diary write needs the native sign-in WebView's captured session
    // (plan 0012) — there is none on web, and proxying the write is banned
    // (three failed spikes, docs/solutions/letterboxd-web-proxy.md). Routing
    // still lists Letterboxd as an applicable target on web; it's just routed
    // to the manual-log fallback instead of the fan-out (plan 0022).
    unsupportedWritePlatforms: ['web'],
  },
  // Unofficial JSON API (plan 0017), TMDB-keyed TV tracking. Symmetric
  // read+write like Trakt: a TV (or TMDB-enriched anime series) log fans out
  // to it and its diary feeds the unified diary. `canWrite` replays a bearer
  // token from plain HTTP (native) or the same-origin CORS proxy (web), so —
  // unlike Letterboxd — no in-session WebView write bridge is needed. Reads
  // and writes both work on web via the proxy (docs/solutions/web-cors-serializd.md).
  serializd: {
    id: 'serializd',
    label: 'Serializd',
    mediaTypes: ['TV'],
    canRead: true,
    canWrite: true,
  },
};
