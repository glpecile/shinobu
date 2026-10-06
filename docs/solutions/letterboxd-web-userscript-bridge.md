# Letterboxd web writes through Tampermonkey

Date: 2026-09-30. Plan: `docs/plans/0042-letterboxd-userscript-spike.md`.

## Evidence

The user installed userscript version 0.3.0 and reported that the integrated
Shinobu web log flow works. This is a human-run result in the user's normal
browser, not an automated browser or relay test. The user clarified that it
did not reliably return to the original Shinobu tab; tab close/focus is not
confirmed working. Separate live checks of the
failure branches were not reported.

The user tested a watchlist removal with version 0.5.0 and reported that the
film appeared removed, but Shinobu displayed "No watchlist receipt" and the
Letterboxd tab stayed open. That error is reached only after an HTTP 2xx
response fails the script's empty-204 check. The exact status and body were
not captured. Plan:
`docs/plans/0043-letterboxd-userscript-watchlist.md`.

Version 0.5.1 accepts HTTP 2xx watchlist responses, matching the native adapter,
while rejecting explicit JSON errors and non-JSON bodies. It also fixes a
separate close race: a receipt can arrive before `GM.openInTab` resolves its
handle. The success path now awaits that handle before closing and reporting.
Offline checks cover both fixes; live close/focus verification is pending.

Version 0.6.0 carries the log form's heart choice as `like` in the existing
diary POST and advertises bridge revision 6. Older scripts still log without
likes; Shinobu disables their heart toggle and rejects liked requests before
handoff rather than allowing those scripts to silently send `like: false`.
The userscript round-trip tests cover true, omitted/default-false and invalid
like values. Live provider verification is pending.

## Working path

1. The script marks its availability on Shinobu's page. Routing makes Letterboxd
   writable for film logs, watchlist adds with version 0.4.0, and removals with
   version 0.5.0. Older scripts keep unsupported writes manual. The corresponding
   manual row is removed.
2. Mark as watched sends the film path, connected username, watched date, tags,
   and rewatch flag to the userscript through a same-window message.
3. Tampermonkey stores the request temporarily and opens a Letterboxd tab.
4. The script checks the signed-in username and film identity, consumes the
   request, and POSTs `/api/v0/production-log-entries` in that browser session.
   A watchlist write instead PATCHes `/api/v0/me/watchlist/{lid}` with
   `{"inWatchlist":true}` for adds or `{"inWatchlist":false}` for removals,
   and accepts an HTTP 2xx response without explicit errors. Both use the film
   page's CSRF token. The user-reported removal used that token successfully,
   though the script misclassified the response.
5. The response returns through Tampermonkey storage to Shinobu's existing
   per-provider report. An acknowledged success attempts to close the opened
   tab, but focus restoration is unreliable. Return to Shinobu manually if needed.

Cookies and the page's CSRF token stay at Letterboxd. The Worker remains GET-only.
The app's public-read proxy is not used to resolve the film LID for this write.

## Boundaries

- Requires Tampermonkey and the bridge script on both origins. Without it,
  Shinobu keeps the manual fallback.
- Install through Letterboxd's Advanced setup in the provider sheet. The
  canonical userscript is `public/letterboxd.user.js`, served at
  `/letterboxd.user.js`; there is no separate source copy to keep in sync.
- Film logs and watchlist additions and removals are enabled with version 0.5.0.
- The script refuses an account or film mismatch. Requests expire and are
  consumed before sending; there is no automatic retry.
- If a response is lost, the write may still have landed. Check Letterboxd
  before retrying from Shinobu.
- This uses an unofficial site endpoint, so Letterboxd changes can break it.

## Relation to earlier failed spikes

`letterboxd-web-proxy.md` records failed cookie replay, server relays, and
automated Chrome. Those failures do not apply to this userscript running in
a normal signed-in browser session. Its September conclusion that web writes
were permanently closed is superseded for this optional transport. A plain
cross-origin popup without a userscript still cannot bridge the session.
