# Letterboxd web parity via API-route proxy

- **Status:** abandoned (2026-07-20, after the phase-0 spike)
- **Priority:** p2
- **Plan:** `docs/plans/0015-letterboxd-web-api-routes-proxy.md` (abandoned)
- **Spike result:** `docs/solutions/letterboxd-web-proxy.md`

The phase-0 spike ran first and decided it: server-side GET reads pass
Cloudflare, but every state-changing POST (`production-log-entries`,
`user/login.do`) is 403-challenged by Cloudflare client fingerprinting even
from the user's own IP/UA with valid cookies. Web writes and proxy sign-in
are impossible; the owner decided reads-only web parity wasn't worth shipping
a proxy for. Letterboxd stays native-WebView-only, exactly as plan 0012 left
it. All spike code (API routes, `web.output: "server"`) was reverted; the EAS
project link in `app.json` was kept for future EAS use.
