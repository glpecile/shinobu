# Letterboxd userscript watchlist writes

Extend the verified log handoff with watchlist adds and removals in script
0.5.0. Reuse the film and account validation, expiry, consume-before-write,
and response channel. PATCH `/api/v0/me/watchlist/{lid}` with
`{"inWatchlist":true|false}` using the signed-in page's CSRF token. Accept HTTP
2xx watchlist responses, rejecting explicit JSON errors and non-JSON bodies.
Never retry automatically. Version 0.5.1 corrects the empty-204-only check after
the user reported a removal landing despite a rejected receipt. Await the
opened tab handle before closing on success, even when the receipt arrives first.

Wire the existing watchlist picker and mutation into this transport without
cookies or a public film-page fetch. Version 0.3.0 remains usable for logs but
keeps watchlist writes manual. Version 0.4.0 supports only adds. Removal detection
requires 0.5.0 in both the picker and mutation. Native and the
GET-only Worker stay unchanged.

Check the cross-tab request and receipt offline, along with routing and the
provider adapter. Live verification of the response/close fix requires installing 0.5.1,
reload Shinobu, add and remove a film with Letterboxd selected, and verify membership on
Letterboxd. Tab focus restoration remains unreliable. No native rebuild.
