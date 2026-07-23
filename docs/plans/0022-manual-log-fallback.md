---
title: Manual-Log Fallback (Letterboxd Web + General Policy) - Plan
type: feat
date: 2026-07-23
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Manual-Log Fallback (Letterboxd Web + General Policy) - Plan

## Goal Capsule

- **Objective:** When Shinobu can't write a log to a connected provider — Letterboxd on web (writes are structurally impossible there: they need the native WebView session, and the write path is fingerprint-walled server-side, plan 0018) or any provider whose write fails/skips at runtime — give the user a one-tap external link to log it manually on that provider's site. Make this the standing policy for write fail-cases, codified in AGENTS.md.
- **Authority:** AGENTS.md (partial-failure contract, registry/routing centralization, wrapper-component rules) overrides this plan; this plan overrides implementer preference; the owner's live decisions override both.
- **Execution profile:** `execution: code`. Pure routing/URL units test-first; UI units smoke-verified on web + dev client.
- **Stop conditions:** Stop and surface — do not guess — if (a) any approach would attempt actual Letterboxd writes from web (proxying writes is banned — three failed spikes, `docs/solutions/letterboxd-web-proxy.md`), (b) the change would inline `if (provider === ...)` platform checks at call sites instead of going through registry/routing, or (c) plan 0023 has landed a conflicting `external-urls` helper shape (coordinate — see KTD-2).
- **Tail ownership:** Implementer lands via PR with before/after web screenshots of the log sheet (memory: PR screenshots on request — include them; this is a UI-visible change).

---

## Product Contract

### Summary

Extend the provider registry/routing with platform-aware write support so Letterboxd on web is classified upfront as a "manual" target (shown in the log sheet with an external link, excluded from the fan-out), and extend the log result rendering so any failed — or reason-carrying skipped — provider write surfaces a "Log on {Provider}" external link. Both consume a new pure `providerItemUrl` helper (shared with plan 0023).

### Problem Frame

On web, a Letterboxd-connected user who logs a movie gets a per-provider failure ("reconnect"-flavored error) they can do nothing about: the write requires the native WebView session and Letterboxd's fingerprint wall forbids any server-side relay (plans 0012/0015/0018). The failure is honest but a dead end. More generally, every write failure today ends at an error message; the user's actual recourse — go log it on the provider's own site — is never offered. The fan-out already reports per-provider outcomes (`src/features/log-media/fan-out.ts`), so the missing pieces are platform-aware routing and link affordances.

### Requirements

**Routing & capability**

- R1. The provider registry (`src/lib/providers/registry.ts`) declares, per provider, platforms where writes are unsupported; Letterboxd declares web. Routing (`src/lib/providers/routing.ts`) exposes a pure split of log targets into *writable* and *manual-only* given `(item, connected, platform)` — no `Platform.OS` reads inside the pure functions, no provider conditionals at call sites.
- R2. Manual-only providers are excluded from the fan-out write set (never attempted, never counted as failures) while remaining visible as applicable targets.

**Log sheet (upfront affordance)**

- R3. On web, a movie log whose applicable targets include Letterboxd shows a non-toggleable "Letterboxd — log manually" row in the confirm sheet's provider area, with an external-link affordance opening the film's Letterboxd page. It does not count toward the "select at least one provider" rule and is not part of `confirmLabelFor`'s target list.
- R4. When the manual row's URL can't be built (no letterboxd slug and no tmdb id), the row still appears with a link to the provider's log surface root (letterboxd.com) — the affordance degrades, it never vanishes silently.

**Result state (general fail-case policy)**

- R5. Any provider outcome with `status: 'error'` renders a "Log on {Provider}" external link beneath its failure message when `providerItemUrl` can build one.
- R6. Adapter-reported skips (`status: 'skipped'` **with** a `reason` — e.g. Serializd can't resolve a season) get the same link; reconcile skips (no `reason` — already in sync) get none.
- R7. The policy is codified in AGENTS.md's provider section: an unsupported-or-failed provider write surfaces a manual deep link to that provider's page for the item — never a bare dead-end error.

**Link building**

- R8. A pure `providerItemUrl(providerId, item)` builds the provider's public page URL for a `NormalizedMediaItem`, returning null when no id path exists: Trakt → `trakt.tv/{movies|shows}/{traktId}` (numeric id redirects to slug), else `trakt.tv/search/tmdb/{tmdbId}?id_type={movie|show}`; AniList → `anilist.co/{anime|manga}/{anilistId}`; Letterboxd (movies/films only) → `letterboxd.com/film/{slug}/` from `externalIds.letterboxd`, else `letterboxd.com/tmdb/{tmdbId}` (documented redirect); Serializd → `serializd.com/show/{tmdbId}`. Anime films route to movie-shaped URLs (`isFilm`, mirroring `routing.ts`).
- R9. External links open via one shared helper: new tab on web, in-app browser (`expo-web-browser`, already a dependency) on native.

### Scope Boundaries

**Deferred to Follow-Up Work**

- Episode/season-deep links (provider URLs point at the show/film page; deep-linking a specific episode page is provider-specific and low-value for the fallback).
- Retry buttons on failed writes (separate concern from the manual fallback).
- Marking a manual log as "done" back in Shinobu (the next Letterboxd RSS read picks it up naturally).

**Out of scope**

- Any Letterboxd write attempt from web, proxied or direct (standing prohibition).
- Registry `canWrite` changes — Letterboxd stays write-capable; the new axis is *platform* support, not capability.

---

## Planning Contract

### Key Technical Decisions

- KTD-1. **Platform is data, not environment.** `ProviderDescriptor` gains an optional `unsupportedWritePlatforms?: readonly string[]` (Letterboxd: `['web']`); routing gains `splitLogTargets(item, connected, platform): { writable: ProviderId[]; manual: ProviderId[] }` built on the existing `providersForLog` logic. Callers (the `use-log-targets.ts` hook) pass `process.env.EXPO_OS`-derived platform once; pure functions stay clock/platform-free and unit-testable. Rejected: flipping `canWrite` per platform at module load (hides the target from the sheet entirely — the point is to *show* it as manual) and `Platform.OS` reads inside routing (untestable).
- KTD-2. **`src/lib/providers/external-urls.ts` is shared with plan 0023** (provider source links). Whichever plan lands first creates it with the R8 contract exactly; the second plan extends/reuses — check for the file before creating, and reconcile signatures rather than duplicating.
- KTD-3. **Manual row is presentation, not a fifth outcome status.** The fan-out contract (`ProviderLogOutcome`) is untouched; manual-only providers never enter `fanOutLog`, so no new status value propagates through result handling. The sheet derives its manual rows from the routing split, and the result links derive from existing `error`/`skipped+reason` outcomes. Rejected: adding a `manual` outcome status (would ripple through `LogMediaResult` consumers for a purely presentational concern).
- KTD-4. **One `openExternalUrl(url)` helper** (`src/lib/open-external-url.ts`): web → `window.open(url, '_blank', 'noopener')` via platform file; native → `WebBrowser.openBrowserAsync`. Follows the platform-file convention; components never import `expo-web-browser` or touch `window` directly.

### Assumptions

- `use-log-targets.ts` is the single place sheet targets are computed (it exists; implementer confirms all sheet entry points route through it — `LogMediaButton`, season logging, quick-log).
- The `trakt.tv/{movies|shows}/{numericId}` redirect and `letterboxd.com/tmdb/{id}` redirect keep working (both are long-standing documented behaviors; the URL builder centralizes them for a one-line fix if not — and `scripts/check-external-urls.ts` link-health can cover the URL shapes if patterns fit).

---

## Implementation Units

### U1. `providerItemUrl` helper

**Goal:** Pure URL builder per R8.
**Requirements:** R8, KTD-2.
**Dependencies:** none (coordinate with plan 0023 per KTD-2).
**Files:** `src/lib/providers/external-urls.ts`, `src/lib/providers/external-urls.test.ts`.
**Approach:** Input `(providerId, Pick<NormalizedMediaItem, 'type' | 'isFilm' | 'externalIds'>)`; movie/show shape decided like `routing.ts`'s `effectiveTypes` (anime film → movie URLs; anime series → show URLs for Trakt). Returns `string | null`.
**Test scenarios:** (1) Trakt movie with trakt id → `/movies/{id}`; (2) Trakt show with only tmdb → search-redirect URL with `id_type=show`; (3) AniList manga → `/manga/{id}`; (4) Letterboxd with slug → `/film/{slug}/`; (5) Letterboxd, no slug, tmdb present, `type: 'ANIME', isFilm: true` → `/tmdb/{id}`; (6) Letterboxd for a TV item → null (movies only); (7) Serializd without tmdb → null; (8) every provider with empty `externalIds` → null.
**Execution note:** Test-first; this table *is* the contract plan 0023 reuses.
**Verification:** `bun test`, `bun typecheck`, `bun lint`.

### U2. `openExternalUrl` helper

**Goal:** One cross-platform external-link opener (KTD-4).
**Requirements:** R9.
**Dependencies:** none.
**Files:** `src/lib/open-external-url/index.native.ts`, `src/lib/open-external-url/index.web.ts` (directory convention per AGENTS.md).
**Approach:** Tiny; no state. Native variant `WebBrowser.openBrowserAsync(url)`; web variant `window.open` with `noopener`.
**Test scenarios:** Test expectation: none — two-line platform wrappers; covered by UI smoke in U4/U5.
**Verification:** `bun typecheck`; both bundles build (`bun run build:web`).

### U3. Registry flag + routing split

**Goal:** `unsupportedWritePlatforms` on the descriptor (Letterboxd: `['web']`) and `splitLogTargets` in routing; `use-log-targets.ts` consumes the split.
**Requirements:** R1, R2, KTD-1, KTD-3.
**Dependencies:** none.
**Files:** `src/lib/providers/types.ts`, `src/lib/providers/registry.ts`, `src/lib/providers/routing.ts`, routing tests (existing test file for routing or new `routing.test.ts`), `src/features/log-media/use-log-targets.ts`.
**Approach:** `splitLogTargets` filters `providersForLog`'s result by the platform flag. `useLogMedia` must also exclude manual targets defensively (a caller passing a manual provider in `variables.providers` should not reach the adapter on that platform) — enforce in the mutation's target filtering, not just the sheet.
**Test scenarios:** (1) movie + `['trakt','letterboxd']` connected, platform web → writable `['trakt']`, manual `['letterboxd']`; (2) same on ios → both writable, manual empty; (3) TV item on web → Letterboxd absent from both (not applicable, unchanged); (4) provider without the flag unaffected on all platforms; (5) `useLogMedia` on web with letterboxd forced via `variables.providers` → letterboxd not written.
**Verification:** `bun test`; existing routing/fan-out tests untouched and green.

### U4. Log sheet manual row

**Goal:** The upfront "log manually" row with external link (R3/R4) in the confirm sheet.
**Requirements:** R3, R4.
**Dependencies:** U1, U2, U3.
**Files:** `src/features/log-media/log-confirm-sheet.tsx`, `src/features/log-media/use-log-targets.ts` (expose manual list), possibly `src/features/log-media/log-media-button.tsx` (prop threading).
**Approach:** Render manual rows below the `ProviderPicker`, styled like a `ProviderToggle` but non-interactive-as-toggle: `ProviderIcon` + label + `open-outline` icon, pressing opens `providerItemUrl(...) ?? providerHomeUrl` via `openExternalUrl`. Muted styling (not accent) so it reads as informational; copy: "Log manually on Letterboxd". Must not affect `canConfirm`, `confirmLabelFor`, or the tags-field visibility rule.
**Test scenarios:** Component-level logic extracted where practical (e.g. a pure `manualRowsFor(targets, item)`): (1) web movie with letterboxd connected → one manual row with film URL; (2) no buildable URL → row present with letterboxd.com fallback (R4); (3) native → no manual rows. Rendering verified by smoke.
**Verification:** Web smoke (Playwright headless per `docs/solutions/web-headless-smoke-test-playwright.md`): sheet shows the row; confirm button enabled with only Trakt selected. Dev client: no row on iOS/Android.

### U5. Manual links on failed/skipped outcomes

**Goal:** "Log on {Provider}" links in the result rendering (R5/R6) — the general policy half.
**Requirements:** R5, R6.
**Dependencies:** U1, U2.
**Files:** `src/features/log-media/log-confirm-sheet.tsx` (failure/skip blocks), and the card-level inline notice if it renders failures independently (`src/features/log-media/log-media-button.tsx`, `src/features/up-next/ui/quick-log-button.tsx` — implementer verifies which surfaces render outcome messages and covers each).
**Approach:** Next to each error outcome's message line, and each reasoned skip, render a small pressable link (accent text + `open-outline` 14px) when `providerItemUrl` returns non-null. Reconcile skips (no reason) keep their current copy untouched.
**Test scenarios:** Pure selector `manualLinkForOutcome(outcome, item)`: (1) error outcome + buildable URL → link; (2) error + no URL → message only; (3) skipped with reason → link; (4) skipped without reason → none.
**Verification:** Web smoke with a simulated failure (e.g. temporarily disconnect Serializd token mid-session or use the existing test seams); screenshot in PR.

### U6. Policy codification

**Goal:** AGENTS.md gains the fail-case policy line (R7).
**Requirements:** R7.
**Dependencies:** U4, U5 (documents shipped behavior).
**Files:** `AGENTS.md` (Providers, Sessions & Log Fan-Out section — extend the "Surface partial failure" bullet).
**Approach:** Two sentences max, referencing `external-urls.ts` as the URL source of truth. Check whether any part is oxlint-enforceable (it isn't — reviewer-enforced, like the Suspense rule) and say so.
**Test scenarios:** Test expectation: none — documentation.
**Verification:** `bun lint` clean; wording consistent with this plan's R5/R6 rules.

---

## Verification Contract

- `bun test`, `bun typecheck`, `bun lint` green at every unit.
- `bun run build:web` builds; web smoke (headless Playwright) covers the manual row and a failure link.
- Dev-client sanity: native sheet unchanged for a movie log (no manual row); a real Letterboxd-connected web session shows the manual row on a movie log.
- PR includes before/after web screenshots of the sheet.

## Definition of Done

- R1–R9 satisfied; no write attempt to Letterboxd from web anywhere in the diff.
- No provider/platform conditionals outside registry/routing (review grep: `Platform.OS`/`EXPO_OS` and `=== 'letterboxd'` in `src/features/log-media/`).
- AGENTS.md policy landed; plan 0023 coordination note honored (shared helper not duplicated).
- Abandoned experiments removed from the diff.
