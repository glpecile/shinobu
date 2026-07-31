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
    // `POST /sync/watchlist` and `/sync/watchlist/remove` — both documented,
    // both symmetric with the diary write's ids and auth wrapper (plan 0031
    // R1/R34).
    watchlistWrite: 'write',
    watchlistRemove: 'write',
  },
  anilist: {
    id: 'anilist',
    label: 'AniList',
    mediaTypes: ['ANIME', 'MANGA'],
    canRead: true,
    canWrite: true,
    // `SaveMediaListEntry(status: PLANNING)` / `DeleteMediaListEntry(id)`, both
    // confirmed by live introspection. The add is guarded read-then-decide and
    // never overwrites an existing status (plan 0031 R8/KTD-2) — that guard
    // lives in the adapter, not here: the capability is "possible", not
    // "unconditional".
    watchlistWrite: 'write',
    watchlistRemove: 'write',
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
    // Both verbs verified by plan 0031 U6's account-bound capture
    // (docs/solutions/letterboxd-watchlist-write.md): `PATCH
    // /api/v0/me/watchlist/{lid}` is a **declarative state set**
    // (`inWatchlist: true|false`), not a toggle, so KTD-6's data-loss hazard
    // (a wrong idempotency guess *removing* a film while reporting success)
    // does not exist on this endpoint and a repeat add is idempotent. The
    // adapter (plan 0033, `letterboxd/watchlist-writes.ts`) rides the same
    // captured-WebView-session plumbing as the diary write, so
    // `unsupportedWritePlatforms` above keeps web manual regardless — correct
    // and permanent (docs/solutions/letterboxd-web-proxy.md). Standing
    // rollback: revert both tokens to 'manual' if the endpoint regresses.
    watchlistWrite: 'write',
    watchlistRemove: 'write',
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
    // `watchlist_v2` / `watchlist/remove_v2` exist and are authorised (plan
    // 0031 R6): the Worker's two exact-match POST rules, the season-id guard
    // (`serializd/writes.ts`) and both adapters landed in U9.
    //
    // - `watchlistWrite` is `'write'`: U10 probed KTD-10's named risk and found
    //   **no hazard** — watched and watchlisted coexist per-season on the live
    //   API (13 shows on a real account hold one season id in both lists at
    //   once), so the exclusivity Serializd's copy claims is a UI convention.
    //   Stop-condition (c) does not fire. The same probe found `/progress` has
    //   been removed upstream, so the season filter now runs without input and
    //   is kept for its copy, not as a data-loss guard. Both findings, with
    //   their verification, are in `docs/solutions/
    //   serializd-watchlist-clears-watched.md`.
    // - `watchlistRemove` stays gated on the **Serializd read leg** (R32/R35):
    //   with no read, Serializd can never appear in a `WatchlistEntry`'s
    //   `sources`, so a `'write'` declaration would be an unreachable adapter
    //   behind a silent drop. The upfront `Remove on Serializd` link is the
    //   honest surface until that leg lands.
    //
    // Reverting either token back to `'manual'` is the standing rollback
    // (KTD-9) if the probe's finding or the read ever regresses.
    watchlistWrite: 'write',
    watchlistRemove: 'manual',
  },
  // Official OAuth API (plan 0034), TMDB/IMDB/MAL-keyed TV + movie + anime
  // tracking — the Trakt-detachment provider. Landed **capability-gated**
  // (Letterboxd plan-0033 verify-then-flip precedent): the type system and
  // routing know Simkl, but nothing fans out to it until each leg is verified
  // live. A mid-sequence build can at worst connect Simkl; routing never hands
  // a write to a stub adapter.
  simkl: {
    id: 'simkl',
    label: 'Simkl',
    // TV + MOVIE like Trakt, plus ANIME natively — Simkl is the only provider
    // that matches an *unmapped* anime series/film directly (routing.ts's
    // `effectiveTypes` needs no special case for it).
    mediaTypes: ['TV', 'MOVIE', 'ANIME'],
    // U7 flips this once the read leg (all-items sync + normalize) is live.
    canRead: false,
    // U6 flips this once the U4 write adapters are wired into the fan-out maps.
    canWrite: false,
    // U6 flips this to 'write' together with canWrite ('manual' until then so a
    // connected Simkl degrades to a deep link, never a dead end — plan 0022).
    watchlistWrite: 'manual',
    // Gated on U4's live probe of the remove endpoint (the same
    // verify-then-flip bar Serializd's remove is still held to, R32-style).
    watchlistRemove: 'manual',
  },
};
