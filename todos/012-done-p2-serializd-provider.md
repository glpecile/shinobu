---
status: done
priority: P2
---

> **Done (2026-07-21):** Serializd ships as Shinobu's fourth symmetric opt-in
> provider per `docs/plans/0017-serializd-provider.md`. Registry-declared TV
> read+write (`registry.ts`, `{ mediaTypes: ['TV'], canRead: true, canWrite: true }`);
> the provider lib is `src/lib/providers/serializd/` (auth, season-id, writes,
> diary, progress, normalize, platform transports). Connect: a WebView
> `tvproject_credentials` cookie capture on mobile (via the reusable
> `provider-signin-webview`, which the Letterboxd button was migrated onto) and an
> email/password `/login` exchange on web. Writes fan out through `useLogMedia`
> (episode watched + dated diary entry, or `/watched_v2` for whole seasons) with
> per-provider partial-failure, skip reasons (R9), and R12 diary-evidence reconcile.
> Reads add a fourth slice to the unified diary. Web works through the repo's first
> CORS proxy — a Cloudflare Worker `main` handler (`worker/serializd-proxy.ts`), a
> recorded exception to the "never proxied" policy (AGENTS.md § Web & CORS,
> `docs/solutions/web-cors-serializd.md`).

# Serializd Provider Integration

Serializd (serializd.com) is a TV tracker with an unofficial, TMDB-keyed,
token-authenticated JSON API (three active open-source clients build on it). It is
a natural symmetric TV provider alongside Trakt/AniList/Letterboxd: a TV or
TMDB-enriched anime-series log fans out to it, and its paginated diary feeds the
unified diary.

## What shipped

- **Registry + routing:** `serializd` is a `ProviderId` with a TV read+write
  descriptor; routing derives inclusion from the registry (no inline checks).
- **Provider lib** (`src/lib/providers/serializd/`): bearer-token auth (login +
  `validateauthtoken`, both response shapes), season-id resolution (year-based /
  transient-miss skips), the two-call episode write + `/watched_v2` season write,
  paginated diary normalization (`watchedAt` = `dateAdded` for KTD8 watermark
  correctness), and progress reads — all Effects with the tagged error taxonomy.
- **Platform transports:** native hits the upstream host with the app headers via
  nitro-fetch; web hits the same-origin `/api/serializd` proxy (no `EXPO_OS` gate).
- **Sessions & connect UI:** `state/session/serializd.ts`, the reusable
  `provider-signin-webview` (two consumers: Serializd + the migrated Letterboxd
  button), `connect-serializd-button` (native WebView / web form), and the connect
  screen row.
- **Fan-out + diary:** `useLogMedia` Serializd adapter with reconcile/invalidation
  + the anime TMDB-id enrichment gap closed (KTD2); tags applied to the TV/anime
  log sheets; a fourth unified-diary infinite query + `DIARY_QUERY_ROOTS` entry.
- **Proxy + deploy:** the full-stack Worker (`worker/index.ts` + `wrangler.jsonc`
  `main`, `assets` binding); `wrangler deploy` bundles it (esbuild resolves the
  shared config alias) — static export and Workers Builds pipeline unchanged.

## Manual verification still owed on real hardware/accounts

The JS/TS surface, unit tests (`bun test`), lint, and typecheck are green, and the
Worker bundles under `wrangler deploy --dry-run`. The plan's runtime stop
conditions/smokes need a dev client + a real Serializd account: the native
app-header `GET /show/1396` returning 200 (U3), the `tvproject_credentials` cookie
appearing at WebView sign-in (U5), an on-device log landing on serializd.com, and
the `wrangler dev` / deployed-URL web smokes (U4/U7/U8). If a live response
contradicts the Appendix shapes, follow the plan's stop-condition fallbacks.
