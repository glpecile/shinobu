# Letterboxd web parity via API-route proxy

- **Status:** done (2026-07-22, reads-only scope — writes re-spiked, still walled)
- **Priority:** p2
- **Plan:** `docs/plans/0018-letterboxd-web-reads-proxy.md` (shipped);
  `docs/plans/0015-letterboxd-web-api-routes-proxy.md` (superseded)
- **Spike results:** `docs/solutions/letterboxd-web-proxy.md` (2026-07-20 + 2026-07-22)

Originally abandoned 2026-07-20 when the phase-0 spike showed writes/sign-in
are Cloudflare-walled and a reads-only proxy wasn't worth standing up EAS
Hosting for. The Serializd Worker proxy (plan 0017) made reads nearly free,
so they shipped on 2026-07-22: `worker/letterboxd-proxy.ts` relays
`GET /{user}/watchlist/` + `/{user}/rss/` on the same origin, web reads route
through it (`state/queries/letterboxd.ts`), and web connect validates
usernames live. The Workers-egress write re-spike returned
`challenged: true` — writes stay native-WebView-only; the throwaway spike
route (`worker/letterboxd-write-spike.ts`) stays as the standing harness in
case a valid-credential test ever changes that.
