---
status: in-progress
priority: P2
---

# Letterboxd Provider Integration

Letterboxd is a first-class provider, symmetric with Trakt and AniList — not a
one-time CSV backfill. See `plan.md` 1.2/1.3.

**Unblocked 2026-07-15 by pivoting to the fallback as the shipping design**
(plan `docs/plans/0012-letterboxd-fallback-integration.md`): official API
access was never requested — Letterboxd's policy excludes personal projects —
so the provider ships on public surfaces instead. An access-request email has
been drafted; if access is ever granted, the transport upgrades to the
official REST API per plan 0012 decision 9, without changing the provider's
shape.

## Shipping design (fallback-as-primary)

- **Session**: public Letterboxd username (no OAuth), stored alongside the
  Trakt/AniList sessions in `state/session/`.
- **Read**: watchlist scraped from the public watchlist page into
  `useUnifiedFeed` ("Your Watchlist" row); diary RSS available for future
  reads. Native-only on web (`docs/solutions/web-cors-letterboxd.md`).
- **Write**: **WebView session capture** (decided 2026-07-15; CSV path rejected
  and removed — it also crashed native via `expo-file-system`/`expo-sharing`).
  Automate the user's own logged-in Letterboxd account through an in-app
  `react-native-webview`, injecting the diary POST from inside the browser
  context (Cloudflare-clean). Native-only, rebuild required, ToS-violating,
  fragile — accepted. **Blocked on reconnaissance from a logged-in account**
  (the authenticated diary-log request shape); `registry.ts` stays
  `canWrite: false` until captured. See plan 0012 "Update 2026-07-15".
- **Cross-provider ids fixed**: logging a Letterboxd watchlist movie now
  resolves Trakt/TMDB/IMDB via Trakt text search (`enrich.ts`), so it fans out
  to Trakt instead of dead-ending.
- Empirical findings: `docs/solutions/letterboxd-no-api-fallback.md`.

## Remaining acceptance criteria

- [ ] Username connect flow on the connect screen; `useConnectedProviders`
      includes `letterboxd`.
- [ ] `useLetterboxdWatchlistQuery` (`state/queries/letterboxd.ts`) feeding a
      home-feed row, normalized into `NormalizedMediaItem`.
- [ ] Letterboxd write adapter registered in the `useLogMedia` fan-out for
      movies (incl. anime films), enqueueing with tags.
- [ ] CSV export UI (share sheet on native, download on web) + explicit
      "mark as imported" queue clearing.
- [ ] New quirks written to `docs/solutions/letterboxd-*.md`.

## If official API access is granted later

Swap the transport per plan 0012 decision 9 (OAuth Authorization Code,
create-log-entry with native tags, watchlist endpoint); retire the queue/CSV
path or keep it as an offline fallback.
