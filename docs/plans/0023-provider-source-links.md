---
title: Provider Source Links (Card Sheet + Details) - Plan
type: feat
date: 2026-07-23
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Provider Source Links (Card Sheet + Details) - Plan

## Goal Capsule

- **Objective:** Let users jump from Shinobu to the item's page on its providers: the card-actions sheet gains a "View on {source provider}" row, and the details page gains a closing "View on" section with a link pill for the source provider plus every *connected* provider we can build a URL for.
- **Authority:** AGENTS.md conventions override this plan; this plan overrides implementer preference; the owner's live decisions override both.
- **Execution profile:** `execution: code`. Pure selection/URL units test-first; UI smoke-verified web + dev client.
- **Stop conditions:** Stop and surface — do not guess — if (a) plan 0022 has landed a conflicting `external-urls`/`open-external-url` helper shape (reuse, don't fork — KTD-1), or (b) the work would add provider conditionals in components instead of pure helpers.
- **Tail ownership:** Implementer lands via PR with web screenshots of both surfaces (sheet + details section).

---

## Product Contract

### Summary

Add a pure links-for-item selector on top of `providerItemUrl` (shared with plan 0022), render a source-provider link row in `card-actions-sheet.tsx`, and a "View on" pill section at the end of the details screen listing the source provider first plus each connected provider with a buildable URL.

### Problem Frame

An item's card modal and details page are dead ends toward the providers that own the underlying data: a Trakt-sourced show offers no way to open its Trakt page, and a user connected to AniList/Serializd/Letterboxd can't jump to the item there either. All the ids needed to build these URLs already sit on `NormalizedMediaItem.externalIds`, and the item's source provider is encoded in its `id` prefix (`${providerId}-${nativeId}`).

### Requirements

- R1. The card-actions sheet (`src/features/card-actions/card-actions-sheet.tsx`) shows a "View on {SourceProvider}" row — same visual family as "View details" (icon + label rows) — when the source provider's URL is buildable; hidden otherwise. Pressing opens the URL externally (in-app browser on native, new tab on web) without closing-and-navigating like the internal rows do.
- R2. The details screen (`src/app/details/[id].tsx`) renders a "View on" section after the credits/studios sections: one pill per linkable provider (`ProviderIcon` + label), source provider first.
- R3. The details set = source provider (linked even if currently disconnected — it's where the item came from) ∪ connected providers, filtered to buildable URLs, deduped, applicability implied by URL-buildability (a TV item never yields a Letterboxd URL).
- R4. Link selection is a pure, tested function; components contain no provider conditionals.
- R5. External-link affordance is visually distinct from internal navigation (`open-outline` iconography, consistent with the existing sheet rows).

### Scope Boundaries

**Deferred to Follow-Up Work**

- A TMDB link (metadata source, not a tracker — including it would blur the registry's "TMDB is not a provider" line; revisit if users ask).
- Links for *non-connected, non-source* providers (discovery use case).
- Episode/season-level deep links.

**Out of scope**

- Any change to fan-out, registry capabilities, or the manual-log fallback (plan 0022 owns fail-case links).

---

## Planning Contract

### Key Technical Decisions

- KTD-1. **Shared helpers with plan 0022.** `src/lib/providers/external-urls.ts` (`providerItemUrl(providerId, item): string | null`) and `src/lib/open-external-url/` (platform-split opener: `WebBrowser.openBrowserAsync` native, `window.open(_blank, noopener)` web) are specified identically in plan 0022 (its U1/U2, R8/R9 — Trakt id/slug + tmdb-search fallback, AniList anime/manga, Letterboxd slug + `letterboxd.com/tmdb/{id}` redirect, Serializd tmdb; anime-film movie-shaping per `routing.ts`). Whichever plan lands first creates them; the other reuses. If neither exists, create per that spec including its full test table.
- KTD-2. **Source provider from the id prefix.** `sourceProviderOf(item)` parses the `${providerId}-${nativeId}` id shape (first segment before the first `-`, validated against the registry's `ProviderId` union) — the shape is documented on `NormalizedMediaItem.id` (`src/types/media.ts`). Invalid/unknown prefix → null, row hidden. Lives next to the link selector, not in components.
- KTD-3. **One selector for both surfaces.** `providerLinksFor(item, connected): Array<{ provider: ProviderId; url: string }>` implements R3 ordering/dedup; the sheet takes `[0]`-when-source, details renders all. Rejected: separate per-surface logic (drift risk).
- KTD-4. **Details section is plain, not a `SuspenseSection`.** Links derive synchronously from the already-resolved item — no query, no boundary, no skeleton. Render after the credits `SuspenseSection`, hidden entirely when the list is empty.

### Assumptions

- The details screen's `shown` item (post metadata-merge) retains the original `id` and enriched `externalIds` — links use the same `shown`/`item` object the log button receives.

---

## Implementation Units

### U1. Shared helpers (create-if-missing)

**Goal:** `providerItemUrl` + `openExternalUrl` exist per the plan 0022 spec (its U1/U2).
**Requirements:** KTD-1.
**Dependencies:** none — coordination unit.
**Files:** `src/lib/providers/external-urls.ts`, `src/lib/providers/external-urls.test.ts`, `src/lib/open-external-url/index.native.ts`, `src/lib/open-external-url/index.web.ts`.
**Approach:** Check for the files first. If plan 0022 landed them, this unit is a no-op read-through (verify signatures). If not, implement exactly per plan 0022 U1/U2 including its eight-case test table, so the sibling plan's U1 becomes the no-op.
**Test scenarios:** Plan 0022 U1's table (only when creating here).
**Verification:** `bun test`, `bun typecheck`.

### U2. Link selection helpers

**Goal:** `sourceProviderOf(item)` and `providerLinksFor(item, connected)` (KTD-2/KTD-3), pure + tested.
**Requirements:** R3, R4.
**Dependencies:** U1.
**Files:** `src/lib/providers/provider-links.ts`, `src/lib/providers/provider-links.test.ts`.
**Test scenarios:** (1) trakt-sourced movie, connected `['trakt','letterboxd']`, both buildable → trakt first, letterboxd second; (2) source provider disconnected → still included, first; (3) source appears in connected → no duplicate; (4) TV item with letterboxd connected → no letterboxd entry (URL null); (5) id with unknown prefix (`tmdb-123`… any non-ProviderId) → sourceProviderOf null, selector returns connected-only links; (6) empty externalIds + unknown source → empty array; (7) anime film (`isFilm`) with trakt + letterboxd connected → both movie-shaped URLs present.
**Execution note:** Test-first.
**Verification:** `bun test`, `bun typecheck`, `bun lint`.

### U3. Card-actions sheet row

**Goal:** "View on {SourceProvider}" row in the sheet (R1, R5).
**Requirements:** R1, R5.
**Dependencies:** U1, U2.
**Files:** `src/features/card-actions/card-actions-sheet.tsx`.
**Approach:** Insert between "View details" and "Hide from feed" (external jump groups with navigation, above the destructive-ish action), same row anatomy (`PresstableOpacity`, icon 18, `font-sans-semibold`) with `ProviderIcon` for the provider and a trailing small `open-outline` to mark it external. Press → `openExternalUrl(url)`; do **not** call `onClose()` first on web (the new tab takes focus; the sheet closing under it causes a jarring background reflow — match whatever "Hide from feed" haptic/close behavior feels right on native: close after opening).
**Test scenarios:** Test expectation: none — thin composition over U2 (selector already tested); rendering covered by smoke.
**Verification:** Web smoke: long-press/⋯ a Trakt-sourced card → row shows "View on Trakt", opens trakt.tv in a new tab. Dev client: opens in-app browser.

### U4. Details "View on" section

**Goal:** Closing pill section on details (R2, R3, R5).
**Requirements:** R2, R3, R5.
**Dependencies:** U1, U2.
**Files:** `src/app/details/[id].tsx` (or an extracted `src/features/provider-links/provider-links-section.tsx` if the route file is getting heavy — implementer's call, kebab-case either way).
**Approach:** Mirror `StudiosList`'s pill anatomy (`bg-surface border border-border rounded-full px-4 py-2`) with `ProviderIcon` + label + small `open-outline`; section title "View on" in the `text-xl font-display` style of sibling sections; placed after the credits `SuspenseSection`, plain conditional render (KTD-4). Uses the same `shown` item as the rest of the screen and `useConnectedProviders()`.
**Test scenarios:** Test expectation: none — thin composition over U2; covered by smoke on: trakt-sourced show (Trakt + Serializd pills when both connected), anime film (Trakt/AniList/Letterboxd pills), item with no buildable URLs (section absent).
**Verification:** Web + dev-client smoke across those three item shapes; light/dark themes both render (tokens only, no hex).

---

## Verification Contract

- `bun test`, `bun typecheck`, `bun lint` green.
- `bun run build:web` builds; web smoke covers U3/U4 happy paths.
- PR includes web screenshots (sheet row + details section) per house preference.

## Definition of Done

- R1–R5 satisfied on web, iOS, and Android surfaces (hot-reload-only change — no native modules added, state this in the PR).
- No provider conditionals in components (review grep: `=== 'trakt'` etc. in `src/features/card-actions/`, `src/app/details/`).
- Shared helpers exist exactly once (no fork of plan 0022's spec).
- Abandoned experiments removed from the diff.
