# Letterboxd userscript spike

## Goal

Replace the web log sheet's manual Letterboxd link with a userscript-backed write
from Shinobu's normal Mark as watched flow. Use a normal, human-signed-in
Letterboxd browser session. No CDP, cookie replay, or server relay.

## Scope

Advanced setup exposes this optional, experimental transport in Letterboxd's
provider sheet, before and after connection. Serve the installable script from
`public/letterboxd.user.js`, show detection status, and explain the browser,
same-account, reload, manual-fallback, and tab-return requirements. Native
connection screens remain unchanged.

- A userscript on Shinobu and Letterboxd, handing requests between tabs through
  Tampermonkey storage. Allowed app origins are production and localhost/127.0.0.1
  ports 8081 and 19006.
- Shinobu detects version 0.3.0 and includes Letterboxd in the existing provider
  picker and fan-out. Without the script, the manual fallback remains.
- Mark as watched opens a Letterboxd tab and sends `/api/v0/production-log-entries`.
- Match the native bridge payload: film LID, watched date, rewatch, tags, `like: false`.
- Use the page's CSRF token and browser-managed session. Do not export cookies.
- Report HTTP failures, challenges, API errors, or an acknowledged log entry.
- Never retry automatically, including when the response is lost.
- Verify the signed-in Letterboxd username matches Shinobu's connected username,
  and the opened film matches its slug or TMDB ID. Expire requests after 55 seconds
  and consume them before writing so reloads do not repeat a request.
- Watchlist writes remain manual. Keep native WebView writes unchanged.

## Manual gate

Install `public/letterboxd.user.js` in Tampermonkey in your
ordinary browser profile. Enable userscript execution as required by your browser.
Sign in manually, then visit a film you can log on a test account.

1. Replace the installed script with version 0.3.0, save, and reload Shinobu.
   Tampermonkey may request approval for the new sites and cross-tab APIs.
2. Sign into Letterboxd as the same username connected in Shinobu.
3. In Shinobu, open a film's Mark as watched sheet. Letterboxd should be selectable
   under Write to, without the manual-log row.
4. Select Letterboxd, choose the date and optional tags, then press Mark as watched.
   No userscript menu or second data-entry step is needed.
5. The script opens a Letterboxd tab and writes. It attempts to close the tab
   after an acknowledged success, but returning focus to the original Shinobu
   tab is not reliable. Return manually if necessary. Shinobu reports
   Letterboxd's result alongside the other providers.
   Verify the entry's film, date, and tags in Letterboxd.
6. If it fails, check for an entry before retrying. Try Letterboxd's own log
   action as a control. Record the HTTP status and whether it was challenged.

No rating, review, or privacy override is sent, matching Shinobu's native log.
Letterboxd represents dated film logs as diary entries; this is an actual write,
not a diary viewer or form-prefill helper. Clean up test entries
manually. Do not share cookies, CSRF values, or full network captures.

## Status and next gate

Verified by the user in a signed-in browser on 2026-09-30 with version 0.3.0.
The user subsequently clarified that returning to the original Shinobu tab did
not work reliably. Treat write acceptance as confirmed and tab return as an
unresolved limitation, not a completed part of the spike.
See `docs/solutions/letterboxd-web-userscript-bridge.md`. Offline checks cover the cross-tab log,
account and film validation, response handling, duplicate prevention, routing,
and provider transport;
the user-run check establishes live acceptance for the tested flow, not every
failure branch or browser.

The handoff is wired into the existing log fan-out. The manual fallback remains
when the userscript is absent. No Worker changes or native rebuild are needed.
