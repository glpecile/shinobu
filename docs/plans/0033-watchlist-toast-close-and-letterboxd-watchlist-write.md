---
title: Watchlist Toast Close and Letterboxd Watchlist Write - Plan
type: feature
date: 2026-07-30
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: owner-decisions
execution: code
---

# Watchlist Toast Close and Letterboxd Watchlist Write - Plan

## Goal Capsule

Plan 0032 shipped the picker-then-toast idiom with one rule too strict, and
plan 0031 left one adapter gated on evidence that has since been recorded.
This plan closes both gaps:

- **Objective (toast rule):** a write whose only "leftover" is an *upfront
  manual row* ends in a toast and closes the sheet. Today
  `isCleanWriteReport(report, report.manual)` treats the manual bucket as
  "something left to read", so adding a film to Trakt while Letterboxd sits in
  the manual bucket keeps the sheet open with an inline "Added to Trakt." line
  and fires no toast. That is wrong: the manual row was already visible before
  confirm, so it is not news. Only **post-write news** — a failed provider or
  a reasoned skip, both of which carry a `providerItemUrl` link a toast can't
  hold — holds the sheet open. Applied to the log verb too, so both verbs keep
  one idiom (owner decision, 2026-07-30).
- **Objective (Letterboxd watchlist adapter):** the endpoint captured by plan
  0031 U6 (`docs/solutions/letterboxd-watchlist-write.md`) becomes a real
  adapter, native only, riding the same captured-WebView-session plumbing as
  the diary write. Only once the adapter exists do
  `letterboxd.watchlistWrite` / `watchlistRemove` flip from `'manual'` to
  `'write'` in `registry.ts`. `unsupportedWritePlatforms: ['web']` keeps web
  manual regardless — correct and permanent (the fingerprint-wall spikes are
  unaffected, `docs/solutions/letterboxd-web-proxy.md`).
- **Authority:** AGENTS.md overrides this plan where they conflict. The
  captured-endpoint doc is the evidence contract R37/KTD-6 demanded; nothing
  here re-opens plan 0031's data-loss guards for the *other* providers
  (Serializd's two gates in `registry.ts` are untouched).

## Owner decisions

**2026-07-30:**

- Upfront manual rows do not block the clean close. Post-write news only.
- The remove verb's `unknown` bucket follows the same rule: those rows render
  in the same `ManualWriteRows` slot *before* confirm, so they are equally
  not news. R35's "withhold the settled Removed label" concern lives on the
  settled-label surface (`useIsWatchlisted`), not on the sheet-close rule.
- Letterboxd becomes a real watchlist write target on native, both verbs.
  KTD-6's toggle hazard is discharged: the endpoint is a **declarative state
  set** (`{"inWatchlist": true|false}`), so a repeat add is idempotent and a
  wrong guess cannot remove a film.

---

## Product Contract

### Summary

Confirming a watchlist add of a film to Trakt (with Letterboxd shown as a
manual row) fires the "Added to watchlist" toast and closes the sheet — the
manual row was pre-confirm information, not a report. A failed provider or a
reasoned skip still keeps the sheet open, links intact. And on iOS/Android,
Letterboxd stops being a manual row at all for the watchlist verbs: it joins
the fan-out as a real target, adding and removing via the captured signed-in
WebView session.

### Requirements

- **R1 (clean = post-write news only).** `isCleanWriteReport` returns clean
  when: at least one provider succeeded, none failed, and no outcome is a
  *reasoned* skip. Upfront rows — the add's `manual`, the remove's `manual`
  and `unknown` — no longer factor in. The `leftover` parameter is deleted,
  not defaulted: a parameter nothing should pass is a parameter someone will
  pass.
- **R2 (one idiom, six call sites).** All callers drop their second argument:
  `WatchlistAddPicker`, `WatchlistRemovePicker`, `LogMediaButton`,
  `QuickLogButton`, `SeasonsSection`, `AnimeSeasonsSection`. No caller keeps
  a private leftover computation.
- **R3 (adapter is a state set, shared by both verbs).** One effect,
  `setLetterboxdWatchlist(deps, item, inWatchlist)`, with
  `addToLetterboxdWatchlist` / `removeFromLetterboxdWatchlist` as the two
  verb-shaped exports. Flow inside the authenticated WebView, per the capture:
  1. navigate to the film page (slug, or `/tmdb/{id}/` redirect) — same
     `filmPathFor` the diary write uses;
  2. read the film **LID** off the page's `production:identifier` meta
     (fallback: the LID resolved over public nitro-fetch, same as diary);
  3. `POST /ajax/letterboxd-metadata/` → `{ csrf }`;
  4. `PATCH /api/v0/me/watchlist/{lid}` with `x-csrf-token`, body
     `{"inWatchlist": true|false}` → 204.
- **R4 (response interpretation).** 204/2xx → ok. 401/403 → dead session
  (`ProviderAuthError`, "reconnect Letterboxd"). 429 → rate limit. Anything
  else → tagged error with the status in the detail. A missing session or
  transport (web, disconnected) fails as a dead session before any network,
  exactly like `logToLetterboxd`.
- **R5 (movies only).** Same type guard as the diary write: `MOVIE` or anime
  film (`isFilm`). Routing already guarantees this; the guard is the same
  defensive tagged error the diary write carries.
- **R6 (registry flip is the last step).** `letterboxd.watchlistWrite` and
  `watchlistRemove` flip to `'write'` only in the same change that lands the
  adapter keys in `WATCHLIST_ADAPTERS` / `WATCHLIST_REMOVE_ADAPTERS` —
  flipping first routes the verb into `runProviderWrites`' loud
  missing-adapter error.
- **R7 (web stays manual).** `unsupportedWritePlatforms: ['web']` is already
  on the descriptor and `splitWriteTargets` applies it per-platform; no web
  code path changes. The manual-reason copy for Letterboxd-on-web must still
  read correctly after the flip.
- **R8 (remove reaches Letterboxd).** Letterboxd has a watchlist read leg, so
  after the flip a Letterboxd-sourced `WatchlistEntry` routes the remove to
  the adapter on native (`splitWatchlistRemoveTargets` intersects with
  `sources`). The declarative endpoint makes remove-when-absent a 204 no-op,
  so the pagination-incompleteness caveat (`incomplete`) costs nothing extra.

### Known Tricky Decisions

- **KTD-1 (why `unknown` stops blocking too).** The remove picker renders
  `manual` and `unknown` in one `ManualWriteRows` slot before confirm. If
  `manual` is "not news" because the user saw it, `unknown` is too — keeping
  it as a blocker would mean two visually identical pre-confirm rows with
  opposite close behavior, which is exactly the kind of invisible distinction
  plan 0032 KTD-3 exists to prevent. What `unknown` *still* does is withhold
  the settled "Removed" label — that lives elsewhere and is untouched.
- **KTD-2 (post-write `manual` can theoretically widen).** The mutation
  re-plans on the enriched item, so `report.manual` could name a provider the
  unenriched pre-confirm split didn't show. Accepted: enrichment "only ever
  widens", the pickers' own split hooks run the same enrichment through the
  same cache, and the window is a frame. A provider gained by enrichment is
  still an *upfront-class* fact (a deep link, not a report), so the toast is
  still the right ending.
- **KTD-3 (CSRF source: metadata call, not `supermodelCSRF`).** The diary
  write reads `window.supermodelCSRF` off the film page. The watchlist
  capture shows the site itself fetching a fresh token from
  `POST /ajax/letterboxd-metadata/` and sending it as `x-csrf-token` on the
  PATCH. The adapter replays what was observed (R37's whole point), with the
  page-global as documented-but-unused fallback knowledge, not code.
- **KTD-4 (a second transport function, not a generalized bridge).** The
  bridge's navigate→wait→inject machinery is shared; the injected script is
  verb-specific. `webview-bridge.ts` gains `letterboxdWatchlistWebFetch` and
  a `buildWatchlistScript`, reusing the same pending-map/timeout/load-wait
  internals — not a generic "run any script" surface, which would be an
  invitation to bypass the documented endpoints.
- **KTD-5 (KTD-6 of plan 0031 is discharged, not waived).** The original
  hazard was a *toggle* endpoint where a wrong idempotency guess removes a
  film while reporting success. The capture classifies the endpoint as a
  declarative state set: the body carries the target state, a repeat add is
  idempotent, and the 204 is unambiguous. The hazard does not exist on this
  endpoint; no cache-based membership heuristic is introduced.

---

## Implementation

### U1 — `isCleanWriteReport` loses its `leftover` parameter

`src/features/write-sheet/is-clean-report.ts`: delete the parameter; clean =
`succeeded.length > 0 && failed.length === 0 && reasonedSkips.length === 0`.
Rewrite the docblock: the sheet-holders are post-write news (failures,
reasoned skips) because they carry links a toast can't; upfront manual/unknown
rows were visible before confirm and are not news. Update
`is-clean-report.test.ts`: the leftover test becomes its inverse (a report
that is clean despite the caller having manual rows), and the six call sites
drop their second argument (R2).

### U2 — Letterboxd watchlist transport (`webview-bridge.ts`)

Extract the shared navigate→wait→submit runner from `letterboxdWebFetch`,
add `buildWatchlistScript(id, request)` implementing R3 steps 2–4 inside the
page, and export `letterboxdWatchlistWebFetch(request)` plus a
`getLetterboxdWatchlistWebFetch()` availability accessor. New request/response
types in `deps.ts` (`LetterboxdWatchlistWebRequest { filmPath, filmLid,
inWatchlist }`), and a `watchlistWebFetch?` field on `LetterboxdDeps`.

### U3 — the adapter (`lib/providers/letterboxd/watchlist-writes.ts`)

`setLetterboxdWatchlist` / `addToLetterboxdWatchlist` /
`removeFromLetterboxdWatchlist`, following `writes.ts`'s structure: session +
transport guard, type guard (R5), `filmPathFor` + `resolveFilmLid` (exported
from `writes.ts` rather than duplicated), then the transport call and R4's
response interpretation. Unit tests with a fake transport: happy add, happy
remove, 401 → auth, 429 → rate limit, no-session, wrong-type, no-ids.

### U4 — wiring + registry flip

- `letterboxdDeps()` (`state/queries/letterboxd.ts`) supplies
  `watchlistWebFetch`.
- `WATCHLIST_ADAPTERS.letterboxd` and `WATCHLIST_REMOVE_ADAPTERS.letterboxd`
  call the two adapters via `Effect.runPromise` at the boundary.
- `registry.ts`: both tokens flip to `'write'`; the descriptor comment
  rewrites to record the discharge (KTD-5) and the standing rollback
  (revert to `'manual'` if the endpoint regresses).
- Stale comments that assert "Letterboxd has no key here" / "U6's spike
  unrun" in `use-watchlist-media.ts`, `use-unwatchlist-media.ts`,
  `remove-targets.ts`, `targets.ts` are updated in the same change.

### U4b — the settled CTA becomes the remove entry point (owner request, 2026-07-30)

Mid-verification the owner asked that the details screen's settled
"On your watchlist" button open the remove flow instead of being disabled.
Shipped in this plan:

- `features/watchlist/find-watchlist-removal.ts` — pure finder from the
  gathered `WatchlistInputs` cache to the merged `WatchlistEntry` (+ the
  gather's `errors`/`incomplete`), using `isWatchlistedIn`'s recognition
  input-by-input and mapping to the merged row via `sourceIds`.
- `WatchlistRemovePickerSheet` — the removal's self-hosted sheet form,
  sibling of `WatchlistAddPickerSheet`.
- `WatchlistMediaButton`: a settled press (self-hosted form only) reads the
  cache at press time and opens the remove picker; cache-only, never a fetch.
  In host mode (the card-actions sheet) the press stays inert — the host has
  its own removal row, and a second sheet stacked over the first is what plan
  0032 U3 bans.

### U7 — a watched film leaves the watchlist (owner decision, 2026-07-30)

Logging a **film-like** item (MOVIE, or ANIME with `isFilm`) that lands on at
least one provider also removes it from every watchlist that holds it —
`features/log-media/remove-watched-from-watchlist.ts`, fired (not awaited)
from `useLogMedia` after the fan-out:

- **Movies only.** A TV log deliberately does not trigger this: one episode
  watched doesn't mean the show stops being "to watch" — shows are removed
  manually (owner decision).
- **Same removal verb, discarded report.** Routes through
  `runWatchlistRemove` — same `sources` intersection, same per-provider
  guards (AniList's R36 fresh-read guard protects the just-logged COMPLETED
  entry; Trakt's server-side auto-remove degrades to a `deleted: 0` skip;
  Letterboxd's state set is idempotent). Best-effort: a derived write the
  user didn't aim never fails the log, holds the sheet, or delays the toast.
- **Cache-only discovery** via `findWatchlistRemoval`; a cold gather cache is
  a no-op, never a fetch.

Also in this pass (owner request, same day): `WriteResultReport`'s
per-provider **error** message lines render `text-accent` like their headline;
reasoned skips stay muted — a "was not on your watchlist" is a fact, not a
failure.

### U5 — verification

- Full gate: `bun lint`, typecheck, `bun test`, `bun check:classnames`,
  `bun check:router-push`.
- iOS simulator (argent): watchlist-add picker on a film shows Letterboxd as
  a *selectable target* (not a manual row); a Trakt-only add with a manual
  row elsewhere ends in a toast and a closed sheet; the log verb's confirm
  with a manual target present also ends in a toast.
- Android is not gated on this host (unreliable emulator — see memory).
