---
title: Mobile Search Fixes & Tracker Card Redesign - Plan
type: feat
date: 2026-07-26
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Mobile Search Fixes & Tracker Card Redesign - Plan

## Goal Capsule

Fix two search bugs (mobile-web focus loss, Android clear button), improve the
Manage Trackers screen's mobile-web spacing, and implement **three selectable
visual variants** of the provider cards for the owner to choose from.

- **Authority:** AGENTS.md conventions override this plan where they conflict
  (tokens-only colors, pressto-only pressables, `components/List` wrapper rule,
  kebab-case, React Compiler no-manual-memo). Within those constraints, this
  plan's decisions are authoritative.
- **Stop conditions:** After U5's variants are implemented and screenshots are
  presented, STOP and wait for the owner's variant choice — do not pick a
  variant yourself or delete the non-chosen ones. Also stop if fixing U1/U2
  turns out to require changes to expo-router internals or patching
  react-native-web (surface findings instead).
- **Landing strategy:** one branch, one PR containing U1–U5. Include
  before/after screenshots for U3 and the three U5 variant screenshots in the
  PR description (repo habit: Playwright headless captures). Applying the
  chosen variant and removing the variant switch is a follow-up commit/PR
  after the owner decides.

---

## Product Contract

### Summary

Four user-reported issues on the search and Manage Trackers surfaces. Two are
functional bugs with platform-specific causes already narrowed by code
research; two are visual-quality work on the `/connect` screen, culminating in
a three-variant card redesign presented for owner selection.

### Problem Frame

- On Firefox Android (mobile web), focusing the search bar opens the on-screen
  keyboard which then immediately closes — search is effectively unusable.
- On Android native, pressing the search field's X (clear) button does not
  clear the results (works on web).
- On mobile-web browsers the Manage Trackers screen feels cramped: a ~64px
  nav rail plus `px-6` gutters on a ~390px viewport, inconsistent section
  rhythm, and no max-width on desktop.
- The connected cards and connect-button cards are visually flat and
  inconsistent (`px-5 py-4` vs `p-5`, bare `rounded` vs `rounded-xl`, four
  copy-pasted card shells, wildly varying card heights).

### Requirements

Search bugs:

- R1. On coarse-pointer (mobile) web browsers, tapping the search field keeps
  focus and the on-screen keyboard stays open until the user dismisses it.
- R2. Desktop web keeps its current affordances: ⌘/Ctrl+K and navigating to
  `/search` focus the field automatically.
- R3. With results on screen and the keyboard open, tapping a result navigates
  to it (the tap is not swallowed as a keyboard dismissal) on all platforms.
- R4. On Android native, pressing the X clears the input text, the results,
  and the `?q=` param — and results do not reappear after the 300 ms debounce
  or after a tab switch/back-resume.
- R5. Clearing keeps focus in the field (current intended behavior).

Manage Trackers layout:

- R6. On narrow mobile-web viewports the screen reads comfortably: consistent
  section rhythm (the Accounts section is not flush under the header when
  nothing is connected), and gutters sized for the rail-narrowed column.
- R7. On desktop web the content column is max-width-constrained and centered,
  consistent with the detail screens' `w-full max-w-* self-center` pattern.

Card redesign:

- R8. The four copy-pasted `*ConnectRow` shells collapse into one data-driven
  provider card component driven by `PROVIDERS` (`src/lib/providers/registry.ts`).
- R9. Three visual variants of the connected + connect card pair are
  implemented behind a local switch and presented as screenshots (light +
  dark, mobile-web + desktop-web widths) for the owner to choose. Final
  selection/cleanup is follow-up work.
- R10. All variant styling uses theme tokens; any per-provider brand color is
  introduced as `global.css` tokens defined in both light and dark variants —
  no hardcoded hex in components.
- R11. The web SSR hydration flash (disconnected → connected on load,
  `docs/solutions/expo-web-ssr-mmkv-storage-on-server.md`) must not get worse:
  connected and disconnected cards should have similar heights in every
  variant (no hero-sized connected cards).

### Scope Boundaries

- **Deferred to follow-up work:** applying the owner's chosen variant, deleting
  the other two, and removing the variant switch; any per-provider health/
  validity probing (today "connected" = a stored session exists — unchanged);
  surfacing Letterboxd's two-tier read-only/write session state is *optional*
  variant material, not required.
- **Non-goals:** native (iOS/Android) redesign beyond what the shared
  components change automatically; touching the Trakt/AniList credential setup
  *flows* (forms keep their logic, only their container styling may change);
  header search bars (`headerSearchBarOptions`) — the custom TextInput stays.

### Assumptions

- "Manage trackers view" = the `/connect` route (`src/app/(tabs)/connect.tsx`,
  the Settings tab).
- Losing auto-focus on coarse-pointer web (user taps the field instead) is an
  acceptable trade to stop the keyboard flash — mobile browsers refuse
  keyboards for programmatic focus without a user gesture anyway.
- Variant choice happens asynchronously from screenshots in the PR; the
  executing agent must not block mid-run on the choice.

---

## Planning Contract

### Key Technical Decisions

- KTD1 — **Gate `autoFocus` off on coarse-pointer web.** `src/app/(tabs)/search.tsx:259`
  sets `autoFocus` unconditionally; react-native-web forwards it as a
  programmatic `node.focus()` at commit, which Firefox Android answers with a
  keyboard flash-open-then-close (no user activation). Keep `autoFocus` on
  native and on fine-pointer web (`matchMedia('(pointer: fine)')`-style
  check); disable it for coarse pointers. The ⌘K focus-signal path
  (`src/features/search/focus-signal.ts`) is desktop-only and stays untouched.
- KTD2 — **Forward `keyboardShouldPersistTaps` in `src/components/List/index.web.tsx`.**
  The web List wrapper strips the prop ("keyboard is a native concern") — but
  react-native-web's ScrollView blurs the focused TextInput on any touch it
  claims when the prop is absent. That structural blur reproduces the
  keyboard-closes symptom the moment results render. Forward the prop to the
  underlying list. This also serves R3.
- KTD3 — **Diagnose the Android clear bug before fixing; strongest hypothesis
  is the controlled-input echo.** `clearSearch()` (`search.tsx:235-240`) sets
  `input=''`/`query=''`/`?q=undefined` then refocuses; on Android the native
  EditText can deliver a queued `onChangeText` with the *old* text, which
  restores `input`, and the 300 ms debounce effect resurrects `query` and
  `?q=` — cached results reappear instantly via `keepPreviousData`. Confirm by
  logging `setInput` calls after a clear; distinguish from the tap never
  landing (does the *text* clear?) and from `router.setParams` no-op'ing
  (does `?q=` survive a tab-switch?). Fix shape: make clear robust to the
  stale echo (e.g. also `inputRef.current?.clear()`, plus a just-cleared guard
  that drops an `onChangeText` echo equal to the pre-clear text). Write the
  root cause to `docs/solutions/` per AGENTS.md.
- KTD4 — **Trackers layout: adopt the detail screens' centering pattern and a
  single spacing rhythm.** Wrap the scroll content in `w-full max-w-2xl
  self-center` (settings content reads better narrower than the details'
  `max-w-4xl`); replace the asymmetric `mb-6`/missing-top-margin/`mt-6` mix
  with a uniform section gap on the container; normalize card padding
  (connected `px-5 py-4` vs connect `p-5` → one value) and button/input radius
  (bare `rounded` = 4px → `rounded-md` or `rounded-lg` consistently, using the
  existing radius tokens).
- KTD5 — **Variants live behind one local constant** (e.g.
  `const CARD_VARIANT: 1 | 2 | 3` near the top of the cards feature), switch
  flipped by hand/Playwright for screenshots. No env var, no persisted
  setting — it is temporary scaffolding removed in the follow-up.
- KTD6 — **Per-provider brand colors become theme tokens** (Trakt `#9F42C6`,
  AniList `#02A9FF`, Letterboxd tri-dot orange/green, Serializd teal — hexes
  currently exist only inside `src/assets/providers/*.svg`). Add
  `--color-provider-*` tokens to `src/global.css` in *both* light and dark
  variants (Uniwind requires identical variable sets). Only the variant(s)
  that use brand tinting need them, but the tokens land with U5 regardless of
  final choice — they are harmless if unused.

### High-Level Technical Design

Card architecture for U4/U5 (directional, not prescriptive):

```
connect.tsx
└─ ProviderCardsSection                    (data-driven: iterates PROVIDERS)
   ├─ split: connected / disconnected     (from useConnectedProviders())
   └─ ProviderCard {id, connected}        (one component, variant-aware)
      ├─ variant 1|2|3 visual shell
      ├─ connected → status line/chips + Disconnect affordance
      └─ disconnected → Connect<Provider>Button   (existing components, unchanged logic)
```

The three variants (each covers *both* card states, light+dark):

- **Variant 1 — Refined rows.** The current visual language, disciplined:
  one padding value, `rounded-card` radius everywhere, icon in a subtle
  `bg-background`/`border-border` chip, a small status dot + "Connected as X"
  line, Disconnect as a quiet bordered button. Lowest risk, no new tokens.
- **Variant 2 — Brand-accented cards.** Per-provider identity: a tinted icon
  chip or thin left accent stripe using the new `--color-provider-*` tokens,
  capability chips derived from `PROVIDERS[id].mediaTypes` (Movies/TV/Anime/
  Manga), Disconnect revealed on hover on desktop web via the JS
  `onPointerEnter`/`onPointerLeave` flag pattern (`docs/solutions/uniwind-no-group-hover-use-pointer-events.md` —
  `group-hover:` does not exist in Uniwind) with an always-visible fallback on
  touch platforms.
- **Variant 3 — Compact list + detail sheet.** Slim uniform rows (icon, name,
  status, chevron); tapping opens the existing `components/sheet` with the
  provider's connect form or connected details + Disconnect. Solves the
  giant-Trakt-setup-form-card problem outright. Mind
  `docs/solutions/bottom-sheet-content-detent-clips-tall-content.md` (tall
  form content needs the `shrink` ScrollView pattern) and
  `docs/solutions/web-pressto-accessibility-role-kills-onpress.md` (rows are
  pressto pressables — leave `accessibilityRole` as the default button).

---

## Implementation Units

### U1. Fix search focus loss on mobile web

**Goal:** Focusing the search field on coarse-pointer web keeps the keyboard
open; results taps still navigate.

**Requirements:** R1, R2, R3.

**Dependencies:** none.

**Files:** `src/app/(tabs)/search.tsx`, `src/components/List/index.web.tsx`
(and `src/components/List/index.tsx` if the prop type needs widening).

**Approach:** KTD1 (gate `autoFocus`) + KTD2 (forward
`keyboardShouldPersistTaps` on web). If a coarse-pointer check helper is
needed, keep it a tiny pure function (e.g. under `src/lib/`) so it is
testable and reusable.

**Test scenarios:**
- Happy path: on a coarse-pointer web browser, tapping the field opens the
  keyboard and it stays open while typing (manual: Firefox Android; approximate
  via Playwright touch emulation for regression).
- R2 guard: on desktop web, navigating to `/search` (and ⌘K) still focuses the
  field.
- R3: with results shown and the field focused, tapping a result card
  navigates (web and native).
- Unit: the pointer-coarseness helper returns false when `matchMedia` is
  unavailable (SSR) and on native.

**Verification:** manual Firefox Android check (keyboard persists); desktop
web autofocus unchanged; `bun lint`, `bun run typecheck`, `bun test` green.

### U2. Fix Android clear button not clearing results

**Goal:** X clears input, results, and `?q=` on Android native, durably.

**Requirements:** R4, R5.

**Dependencies:** none (same file as U1 — land after U1 to avoid conflict
churn).

**Files:** `src/app/(tabs)/search.tsx`; new `docs/solutions/` entry; a small
extracted helper + test file if the guard logic is extracted (e.g.
`src/features/search/` + sibling `.test.ts`).

**Approach:** KTD3 — instrument first, confirm which hypothesis holds
(controlled-input echo is strongest; alternatives: press never landing through
the absolutely-positioned pressto overlay, `router.setParams` no-op), then fix
that cause. Prefer extracting the clear/debounce interaction into a testable
unit over leaving it inline if the fix adds a guard. Record the root cause in
`docs/solutions/` (AGENTS.md requires it for non-obvious fixes).

**Test scenarios:**
- Happy path (Covers R4): type ≥2 chars, wait for results, press X → field
  empty, results gone, `?q=` removed; wait >300 ms → results do not reappear.
- Resume path: after clearing, switch tabs and return → search stays empty
  (no `initialQuery` resurrection from a stale `?q=`).
- R5: after clearing, the field still has focus and the keyboard stays up.
- Unit (if guard extracted): a simulated stale `onChangeText` echo carrying
  the pre-clear text within the guard window is ignored; a genuine new
  keystroke is not.
- Web regression: X still clears instantly on web.

**Verification:** manual on Android (emulator or device); web unchanged;
`bun test` covers the extracted guard; new `docs/solutions/` file exists.

### U3. Manage Trackers spacing pass (mobile web + desktop)

**Goal:** The `/connect` screen reads comfortably on narrow mobile-web
viewports and is centered with a max-width on desktop.

**Requirements:** R6, R7.

**Dependencies:** none (land before U4 so the refactor starts from the fixed
layout).

**Files:** `src/app/(tabs)/connect.tsx` (screen shell + section spacing).

**Approach:** KTD4. Concretely: `w-full max-w-2xl self-center` on the content;
uniform inter-section rhythm (container gap instead of the current
`mb-6`/none/`mt-6` mix — fixes the flush-under-header Accounts section);
keep the `px-6` gutter on desktop but verify it against the 64px rail on a
~390px viewport and reduce to `px-4` on web if still cramped; normalize card
padding and control radii to one value each. Pure styling — no logic changes.

**Test scenarios:** Test expectation: none — styling-only unit. Evidence is
before/after screenshots at ~390px (mobile web) and desktop width, light and
dark, captured headless (see `docs/solutions/web-headless-smoke-test-playwright.md`).

**Verification:** screenshots attached to the PR; `bun lint`,
`bun run typecheck` green; native layout visually unchanged or improved (the
same file renders native — spot-check `pt-16` header spacing survives).

### U4. Collapse the four connect rows into one data-driven ProviderCard

**Goal:** One provider-card component driven by the registry, behavior
identical to today — the baseline all three variants build on.

**Requirements:** R8.

**Dependencies:** U3.

**Files:** new `src/features/trackers/provider-card.tsx` (+ a section
component if useful); `src/app/(tabs)/connect.tsx` (consume it; delete the
inline `ConnectedRow` and four `*ConnectRow` wrappers); the four
`connect-*-button` components stay as-is and slot in as children.

**Approach:** Map over `PROVIDERS` from `src/lib/providers/registry.ts`;
split connected/disconnected via `useConnectedProviders()`; drop the
redundant double connected-check (outer section filter + per-row self-gate).
Keep `getProviderSession(id)?.username` for the status line. No visual change
in this unit beyond what U3 already normalized.

**Test scenarios:**
- Unit: the connected/disconnected split helper — all four providers
  disconnected → 0/4; two connected → 2/2 with registry order preserved.
- Happy path (manual/screenshot): screen renders identically to post-U3 state
  for both a fresh (nothing connected) and a connected session.

**Verification:** `bun test` for the split helper; screenshot diff vs U3 shows
no visual change; `bun lint` (kebab-case, no direct pressto/expo-image
imports) green.

### U5. Implement the three card variants and present them

**Goal:** Three complete visual variants of the connected + connect cards,
switchable via a local constant, with screenshots for the owner to choose.

**Requirements:** R9, R10, R11.

**Dependencies:** U4.

**Files:** `src/features/trackers/provider-card.tsx` (variant shells);
`src/global.css` (`--color-provider-*` tokens in both `@variant` blocks —
KTD6); possibly `src/features/trackers/provider-card-variants.tsx` if one file
gets unwieldy; `src/components/sheet` consumed (not modified) by variant 3.

**Approach:** KTD5 switch + the three variant designs from the High-Level
Technical Design. Guardrails per variant: variant 2's hover-reveal uses the
pointer-events JS flag (no `group-hover:`), with disconnect always visible on
touch; variant 3's sheet content uses the `shrink` ScrollView pattern for the
tall Trakt form and default `accessibilityRole` on pressto rows; every variant
keeps connected/disconnected card heights close (R11, SSR flash). No
`font-bold` with custom fonts; motion (if any) uses `src/lib/motion.ts`
constants.

**Test scenarios:**
- Test expectation: none for the visual shells (styling). The R10 constraint
  is lint/review-enforced (no hex literals in components).
- Manual per variant: connect flow still works for at least one provider
  (button reachable, form usable — variant 3 especially: Trakt setup form
  inside the sheet scrolls, does not clip).
- Screenshot matrix: 3 variants × {light, dark} × {~390px, desktop} × 
  {connected state, disconnected state} captured headless.

**Verification:** screenshot matrix produced and presented (PR description);
`bun lint`, `bun run typecheck`, `bun test` green; variant switch flips
cleanly between all three. Then STOP for the owner's choice (Goal Capsule).

---

## Verification Contract

- `bun lint` — oxlint; also enforces the import/filename conventions the new
  files must satisfy.
- `bun run typecheck` — `tsc --noEmit`.
- `bun test` — bun:test; new tests from U1 (pointer helper), U2 (clear guard),
  U4 (split helper) must pass alongside the existing suite.
- Web smoke: `bun web` + `bun run dev:worker` (proxy middleware — see
  `docs/solutions/local-web-dev-proxy-middleware.md`); Playwright headless for
  screenshots (`docs/solutions/web-headless-smoke-test-playwright.md`).
- Native smoke: `bun android` for U2's manual verification. All changes here
  are JS/TS-only — hot reload, no clean prebuild required.
- Manual checks that cannot be automated: Firefox Android keyboard persistence
  (U1), Android clear behavior (U2).

## Definition of Done

- R1–R8, R10, R11 implemented and verified per unit; R9 satisfied when the
  three variants exist behind the switch and the screenshot matrix is
  presented — the *choice* is explicitly not part of this run.
- All three gates (`bun lint`, `bun run typecheck`, `bun test`) green.
- A `docs/solutions/` entry exists for the U2 root cause (and for the U1 blur
  mechanism if the List-wrapper finding held — the "keyboard is a native
  concern" assumption in `components/List/index.web.tsx` is worth recording).
- No dead experimental code beyond the intentional three variants + switch;
  abandoned diagnostic logging removed.
- Branch pushed, PR open with U3 before/after and U5 variant screenshots,
  ending at the stop condition: awaiting variant selection.
