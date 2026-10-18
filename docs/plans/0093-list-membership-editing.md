# Add and remove list entries

## Scope

Edit the connected user's own Letterboxd and Serializd lists. Add a floating
plus button on owned lists. Search in one sheet, select a film or show, then
replace the search with a confirmation using the logging sheet's content-height
transition. Keep removal behind the existing per-item actions and an inline
confirmation. A successful write updates the cached list and invalidates its
provider's list detail and indices. Failed writes retain retry and external
recovery. No list creation, renaming, reordering, or collaborator permissions.

Letterboxd searches films; Serializd searches shows. Serializd removal targets
an exact show/season/episode entry. Guard ownership in the provider boundary as
well as the UI. Native Letterboxd writes use the authenticated WebView; web
uses the optional userscript, with external recovery when unavailable. Never
change the Letterboxd Worker GET-only boundary.

## Provider findings

2026-10-18: Letterboxd's shipped `main-D56Vb7IE.js` editor chunk
`BP__F_Ra.js` saves through `PATCH /api/v0/list/{lid}` with a current `version`
and `entries` operations. Adds use `{ action: 'ADD', listable: filmLid }`;
deletes use `{ action: 'DELETE', position }`. Read the fresh list and hydrate
its entries through `/s/load-list-entries` before selecting a delete position.
Validate the same account, list owner, identity, CSRF, and response messages.
Only acknowledge a receipt identifying the list and a new version.

Serializd's deployed `_app-c40beb7ca9e94dc8.js` exposes
`POST /api/list/add_item` with `list_id`, `show_id`, optional `season_id` and
`episode_number`. Removal is the existing `POST /api/list/edit` full-list save.
Load a fresh authenticated list, retain all editor fields and entry descriptions,
and refuse incomplete reads rather than erasing unseen entries. Add only these
exact POST endpoints to the existing Serializd Worker allowlist.

## Validation

Extend provider and bridge tests for ownership, rejected receipts, list version
conflicts, exact Serializd entry removal, metadata preservation, and partial-read
refusal. Extend the proxy allowlist tests. Run repository checks and production
web export. Exercise search, confirmation, cancel, failures, and removal on the
running iOS app. Clearly distinguish simulated writes from live provider writes.
All changes are JavaScript and hot reload; no clean native rebuild is needed.

## Result

Implemented owner-only add controls and visible per-entry three-dot actions.
Letterboxd searches films; Serializd searches shows and removes an exact existing
show/season/episode entry. Both flows reuse the logging sheet's in-place steps.
Confirmed writes update list cache and invalidate detail and list indices.
Native list reflow respects reduced motion. Letterboxd web requires userscript
0.8.1; unsupported sessions keep an external recovery action. Serializd web
requires the updated Worker's two exact POST grants.

When the web list-editing script is missing or outdated, offer Install
Letterboxd script directly in the confirmation. Reuse Advanced setup's install
callback instead of sending users to settings to find it. Keep the original
list link as manual recovery.

The iPhone 17 Pro simulator verified search with the keyboard open, selection,
confirmation, adding, removing, failure recovery, and ownership gating, using
in-memory Letterboxd list data and simulated transport receipts. The final
preview data and transport overrides were removed. No real provider writes or
persistent session changes were made. An attempted Serializd runtime preview
could not use an authenticated account; provider tests cover those writes.
Live provider writes, Android and browser interactions remain unverified.

All 1,466 tests, typecheck, lint, class-name/navigation/link checks and production
web export pass. Lint retains five pre-existing test-helper scoping warnings.
JavaScript changes hot reload; no clean native rebuild is needed.

Web follow-up: the shared search field now supplies its icon, fetching spinner,
clear button, skeleton results, and centered empty states. The web List wrapper
strips `scrollEnabled` along with its other native-only props. Poster actions
remain visible on native and appear on hover or keyboard focus on web.

Userscript 0.8.1 (bridge 9) opens the authenticated list editor and reads its
version from the page instead of making an extra API GET. Native uses the same
editor context. Error envelopes display their message, and tests cover a
challenged save, missing editor version, and the obsolete GET returning 403.
The full suite, repository checks, and web export pass after this correction;
a real authenticated browser membership write remains unverified.

The shipping review fixed keyboard access to web actions, partial-list addition
reconciliation, and the Serializd proxy's full-editor payload capacity. Separate
correctness/security, complexity, and UI reviewers approved the final diff.
Two owner-boundary regressions failed before these fixes and passed after them.

Live Chromium QA on the public Horrortober VII list verified grid and row
controls are visually hidden at rest, remain keyboard reachable, show a focus
outline, and open the actions sheet with Enter. No session or provider data was
changed. A native WebView or signed-in browser membership write still needs live
provider verification; the earlier browser attempt could not attach to Helium.
