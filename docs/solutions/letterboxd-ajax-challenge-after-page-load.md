# Letterboxd challenges in-page AJAX after the film page loads

Observed on Android (Pixel 9 emulator, API 36), 2026-10-27. A native write
WebView loaded `/tmdb/496243/` without a challenge, so the `_cf_chl_opt`
guard in `runInPage` let the script run. The script's own requests were then
challenged:

- the diary `POST /api/v0/production-log-entries` answered 403 with
  `<title>Just a moment...</title>` HTML;
- the watchlist `POST /ajax/letterboxd-metadata/` answered challenge HTML, and
  `r.json()` threw `Unexpected token '<'`, which lost the status.

A watchlist removal running in parallel in its own WebView succeeded, so the
session was fine. Each request is challenged separately.

## Fix

The write scripts relay responses through one `relay(r)` in
`webview-bridge.ts`. A response with `cf-mitigated: challenge` (the same signal
the list editor scripts check) posts the `challenge` marker instead of its
HTML. The metadata call checks `r.ok` before it parses JSON. `scriptFailure`
maps `challenge` to a `ProviderNetworkError` with `status: 403` and
`retryable: false`, not `ProviderAuthError`. The user doesn't get a false
"reconnect", nothing replays the diary POST, and the error outcome links to
the film on Letterboxd.

Don't bypass the challenge, proxy the write, or clear and replay cookies.

## Verification after the fix

On 2026-10-27, native UI submissions to the existing `glptest` account passed
on iPhone 17 Pro / iOS 26.5 and Pixel 9 / Android API 36. Inception on iOS
and Parasite on Android both displayed Rewatch and produced RSS entries with
`letterboxd:rewatch=Yes`. A first Arrival viewing on iOS saved No and changed
the action to Rewatch; its subsequent viewing saved Yes.

The four new regression cases fail against the pre-fix source and pass with
the fix: watched-film reconciliation, challenged diary transport, challenged
watchlist metadata transport, and non-retryable challenge classification.
Live requests during this verification succeeded without a Cloudflare challenge;
live challenge completion and recovery UX were not exercised.
