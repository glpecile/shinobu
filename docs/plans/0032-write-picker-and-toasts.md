---
title: Write Picker and Toasts - Plan
type: feature
date: 2026-07-29
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: owner-decisions
execution: code
---

# Write Picker and Toasts - Plan

## Goal Capsule

Plan 0031 shipped three write verbs — log, watchlist-add, watchlist-remove — and
two of them report through an **inline block under a button**. The owner's
verdict on PR A (#41) was blunt: *"this is bad in terms of UI … I want to open a
modal to pick and choose where I watchlist … Showing details like where it got
watchlisted is information we will start delegating to a toast library."*

This plan replaces that surface. It is the **presentation layer of verbs whose
semantics are settled** (`todos/015`, "Not in scope"): the fan-out, the
three-state capability model and plan 0031's three data-loss guards are not
re-opened by a single line here.

- **Objective (picker):** watchlisting opens a target picker, defaulted to every
  applicable connected provider, where the user can deselect. The log path
  already has one inside `LogConfirmSheet`; this makes it a shared component
  rather than a second implementation.
- **Objective (toasts):** the happy path becomes a `burnt` toast — ephemeral, out
  of the way, one implementation across web/iOS/Android — and **both** verbs
  adopt it, so the app has one result idiom rather than two.
- **Objective (manual rows):** the persistent "Add on Serializd" / "Add on
  Letterboxd" rows leave the details screen. Most of them leave by themselves
  when plan 0031's spikes land; the structurally permanent one (Letterboxd on
  web) **moves into the picker**, where it is more discoverable, rather than
  being deleted against AGENTS.md's never-a-dead-end policy.
- **Authority:** AGENTS.md overrides this plan where they conflict. Owner
  decisions (2026-07-28 in `todos/015`, 2026-07-29 below) override the plan.
  Plan 0031's KTD-8 ("no confirm sheet") is **deliberately reversed** by owner
  decision — see R1's note, and do not re-litigate it.

## Owner decisions

**2026-07-28** (`todos/015`): a target picker modal; icons on both CTAs
(*shipped*); the watchlist CTA visually distinct from the log CTA (*shipped*);
results move to toasts; library is **`burnt`**; stop showing the persistent
"Add on …" rows.

**2026-07-29**, answering the two questions `todos/015` said to decide first:

- **The log path adopts toasts too.** One result idiom for two near-identical
  verbs. `LogMediaButton` and `LogConfirmSheet` change in this plan, priced in
  rather than deferred.
- **The picker stays open until the report settles.** It does not close on
  confirm. `burnt` has **no press handler at all**, so a Trakt 420, an expired
  Letterboxd session or a reasoned skip with a `providerItemUrl` link would have
  nowhere to land if the picker were already gone. This is the same argument
  plan 0031 U8 made for the card sheet, now applied to the picker that replaces
  it. Rejected: close-on-confirm with failures reopening the picker — a modal
  that closes and then reappears reads as a bug, and it loses the deselection
  context the user just expressed.

---

## Product Contract

### Summary

Tapping a write CTA opens a sheet listing every applicable connected provider,
all selected. Confirm fires the same fan-out plan 0031 built, against the
selected subset. The sheet **stays mounted** through the write and shows its
outcome. A report with nothing left to read — every target `ok`, no manual rows,
no reasoned skips — closes the sheet and fires a success toast. Anything else
keeps the sheet open and renders the report there, links included.

That split is the whole design, and it follows from one hard constraint:
**a `burnt` toast can announce an outcome, but it can never *be* the recourse.**

### Problem Frame

Three surfaces render write results today, and they disagree:

1. `WatchlistMediaButton` (`watchlist-media-button.tsx:116-221`) — an inline
   block with three families (upfront manual rows, failed outcomes, reasoned
   skips), permanently under the CTA whether or not a write has happened.
2. `LogConfirmSheet` (`log-confirm-sheet.tsx:284-446`) — a sheet carrying a
   provider picker, `ManualLogRows`, and `OutcomeMessage` lines.
3. `LogMediaButton` (`log-media-button.tsx:222-244`) — a fourth, narrower block
   with no manual rows and no per-skip links.

Two of them (1 and 2) already implement the same three families twice, in two
files, with two sets of copy. The picker exists once, inside a component whose
other half is a `watchedAt` field and a tags input that the watchlist verb has
no use for.

The *permanence* of surface 1 is the owner's actual complaint: on a details
screen with Letterboxd connected on web, `Add on Letterboxd` renders **before
any tap and forever**, as a standing apology for a provider that will never
work there.

### Requirements

**The picker**

- R1. Every write verb (log, watchlist-add, watchlist-remove) confirms through a
  sheet listing its applicable connected providers, **all selected by default**;
  deselecting narrows the write. *This reverses plan 0031 KTD-8 by owner
  decision.* It is **not** a reversal of the fan-out: the 2026-07-27 decision
  ("never a per-provider action the user picks a target for") narrows to *never a
  single-provider action the user must aim*, which a multi-select that starts
  fully selected preserves.
- R2. The picker is **one component**, composed by all three verbs, not three
  sheets. `LogConfirmSheet` keeps its verb-specific fields (`WatchedAtField`,
  tags) by composing the shared picker rather than owning a copy of it. Rejected:
  one sheet with every field optional — the two-disjoint-modes variant explosion
  AGENTS.md's button rule exists to stop.
- R3. The confirm label names what will happen **without naming a provider in a
  tagline** — "Add to watchlist" / "Add to 2 watchlists" / "Remove from
  watchlist". Provider names appear only in **results** and in the picker's own
  rows, which are results in the sense AGENTS.md permits: they state fact about a
  specific tracker.
- R4. The sheet **stays open until the report settles** (owner decision). It
  closes only on a report with nothing left to read, defined by plan 0031's
  existing `isCleanWatchlistReport` predicate, generalized to every verb.
- R5. A provider the fan-out structurally cannot write — Letterboxd on web,
  anything declared `'manual'` — renders **in the picker** as a **disabled row
  carrying its reason and its `providerItemUrl` link** ("can't be added from the
  web"). It is never a toggle, never counted by `canConfirm`, and never part of
  the selected set.

**Toasts**

- R6. Success surfaces as a `burnt` toast, one implementation across web, iOS and
  Android. Never a second `.web.tsx` split maintained by hand — that is the axis
  `burnt` was chosen on over `sonner-native`.
- R7. **Nothing that needs a tap lives in a toast.** `burnt`'s options are
  `title`, `message`, `preset`, `icon`, `haptic`, `duration`,
  `shouldDismissByDrag`, `from`, `layout` — there is no `onPress`, no action, no
  button. Every `providerItemUrl` link therefore lives on the picker. This is a
  boundary the design respects, not a defect to work around.
- R8. `burnt` is never imported directly (oxlint-enforced, the same wrapper rule
  the repo applies to `@legendapp/list`, `torph/react`, `@nandorojo/galeria`,
  `cn` and `expo-image`). One `lib/toast.ts` exposes the app's vocabulary —
  `toast.success(title, message?)`, `toast.error(...)` — so the library is one
  file's problem and copy stays consistent.
- R9. Both write paths use the toast. `LogMediaButton`'s and `LogConfirmSheet`'s
  inline success lines are **deleted**, not left beside it: two idioms for the
  same fact is worse than the inconsistency this plan is fixing.
- R10. Toasts respect `prefers-reduced-motion` where the platform exposes it and
  carry a haptic on native only (`burnt`'s `haptic` option), matching the
  existing `haptics.success()` / `haptics.error()` calls the CTAs already make —
  which are **removed** from the call sites so the feedback fires once, not twice.

**The manual rows**

- R11. The persistent upfront manual rows leave the details screen. Their
  contract survives the move (plan 0022 R3/R4/R7, AGENTS.md § Providers): a
  manual target and a reasoned skip still reach the user with a working link, on
  the picker (R5), at the moment they are choosing targets.
- R12. **Two of the three reasons for a manual row disappear on their own** and
  this plan must not pre-empt them by deleting the affordance that covers the
  interim: Serializd declares `'manual'` only until plan 0031 U10's probe lets U9
  flip it, and Letterboxd only until U6's spike. If both land, `manual` is empty
  and R5's rows never render. **Letterboxd on web is structurally permanent**
  (three spike rounds, four transports, all fingerprint-walled —
  `docs/solutions/letterboxd-web-proxy.md`) and is the case R5 is really for.
- R13. If the owner later wants the web-Letterboxd affordance gone entirely, that
  is one line in the picker **plus** an amendment to AGENTS.md's never-a-dead-end
  sentence in the same PR. Not silently contradicted. This plan does not take
  that option.

### Scope Boundaries

**Out of scope**

- Re-opening the fan-out, the three-state capability model, or any of plan
  0031's three data-loss guards (AniList status clobber, AniList delete refusal
  set, Serializd season filter). Semantics are settled; this is presentation.
- A toast **queue/stack** design of our own. `burnt` owns presentation; if it
  stacks poorly on one platform that is a recorded finding, not a component we
  write.
- Toasts for read-side failures. The merged watchlist grid's inline per-provider
  notice (plan 0031 R29/KTD-12) stays exactly as it is — it is a persistent
  statement about what is missing from what you are looking at, which an
  auto-dismissing toast cannot make.
- Undo-in-toast for removal. `burnt` has no press handler (R7), so "Removed ·
  Undo" is not expressible; a real undo affordance is a separate feature.

---

## Planning Contract

### Key Technical Decisions

- **KTD-1. The picker is extracted from `LogConfirmSheet`, in place, not written
  a second time.** That file already contains all three pieces this plan needs as
  private components: `ProviderPicker` (the toggle list with All/None,
  `:120-173`), `ManualLogRows` (`:182-215`) and `OutcomeMessage` (`:221-241`).
  They move to a shared `src/features/write-sheet/` and `LogConfirmSheet`
  composes them, keeping `WatchedAtField` and the tags input as its own. The
  watchlist picker composes the same three plus a confirm pair.

  This mirrors plan 0031 KTD-4's argument exactly, and for the same reason: the
  non-obvious content of these components is not the layout but the *rules* —
  manual rows never affect `canConfirm`, reconcile-skips and reasoned skips
  render differently, `manualLinkForOutcome` has no home-URL fallback while
  upfront rows do. Re-deriving those in a second file is how a partial-failure
  contract silently diverges. Rejected: a `WatchlistConfirmSheet` written fresh
  beside `LogConfirmSheet`.

- **KTD-2. `burnt` is wrapped, and the wrapper is where the platform truth
  lives.** `src/lib/toast.ts` exports the app's two verbs over `burnt`'s
  `toast()`. Rationale beyond the standing wrapper convention: `burnt`'s
  presentation is genuinely different per platform (iOS `SPIndicator`-style
  banner, Android a toast, web Emil Kowalski's `sonner`), so the *one* place that
  should know about `preset`, `duration` and `haptic` is this file. Components
  say "this succeeded"; they never say "show a `done` preset from the top for
  2000ms".

  **NAMED RISK — Android fidelity is UNVERIFIED.** `burnt`'s iOS and web paths
  are its showcase; its Android rendering is the least-demonstrated of the three.
  Verification step in U1: run the toast on an Android dev client and record what
  it actually looks like in `docs/solutions/burnt-toast-platform-behaviour.md`.
  If Android is unacceptable, the fallback is a `lib/toast.android.ts` sibling —
  **one** hand-written split, which is still strictly better than
  `sonner-native`'s two, and the wrapper is what makes that a one-file change.

- **KTD-3. The close rule is a predicate, not a component's judgment.** Plan 0031
  already has `isCleanWatchlistReport` in `features/watchlist-media/copy.ts` —
  "every target `ok`, nothing left to read". It generalizes to
  `isCleanWriteReport(report, manual)` over `ProviderWriteReport`, moves beside
  the shared picker, and is the single input to both "close the sheet" and "fire
  the toast". One predicate, so the sheet cannot close on a report the toast then
  fails to carry. Unit-tested without a renderer, as it is today.

- **KTD-4. The details CTA opens the picker; it does not write.** Today
  `WatchlistMediaButton.add()` calls `watchlist.mutate()` directly. After this
  plan the button's press opens the sheet and the sheet confirms — which is what
  finally lets the three inline result families leave the details screen (R11),
  because there is no longer a surface under the button that a report has to be
  rendered into.

  **The settled-label machinery is untouched.** `useIsWatchlisted` stays the
  truth source (plan 0031 U15/KTD-14) and the shared `mutationKey` pending guard
  stays exactly as specified (R18/KTD-14) — the picker is a second mount of the
  same verb, which is precisely the cross-mount case that guard exists for.

- **KTD-5. `burnt` ships native code, so this is a clean-prebuild PR.** Per
  AGENTS.md § CNG the PR body must state it: `bun ios.clean` /
  `bun android.clean` before the change is visible. Shinobu already cannot run in
  Expo Go (nitro modules), so a dev client is the standing workflow and the cost
  is a rebuild, not a workflow change. `burnt` is by `@nandorojo`, whose
  `@nandorojo/galeria` is already a trusted dependency here.

### Implementation Units

> One PR. The units are ordered so the branch typechecks green at each step.

#### U1. The toast wrapper and the dependency

**Goal:** `toast.success(...)` works on all four targets, from one file.
**Requirements:** R6, R8, R10, KTD-2, KTD-5.
**Files:** `package.json`, `src/lib/toast.ts` (new), `src/lib/toast.test.ts`,
`.oxlintrc.json` (ban the raw `burnt` import), `app/_layout.tsx` if `burnt`'s web
path needs a host element, `docs/solutions/burnt-toast-platform-behaviour.md`.
**Approach:** add `burnt`; expose `toast.success(title, message?)` and
`toast.error(title, message?)` mapping to `burnt`'s `done`/`error` presets with
the haptic on native only. Add the `no-restricted-imports` entry beside the
existing `torph/react` and `@nandorojo/galeria` bans, with the same one-line
reason. Record the Android observation (KTD-2's named risk) in the solutions
file — including "it looked fine", if it did.
**Test scenarios:** the wrapper calls through with the expected preset per verb;
the raw import is lint-banned (assert by running `bun lint` on a fixture, or by
the rule's presence — match how the existing wrapper bans are covered).

#### U2. Extract the shared picker

**Goal:** one `ProviderPicker`, one `ManualWriteRows`, one `WriteResultReport`,
composed by `LogConfirmSheet` with zero behaviour change.
**Requirements:** R2, R5, KTD-1, KTD-3.
**Files:** `src/features/write-sheet/` (new — `provider-picker.tsx`,
`manual-write-rows.tsx`, `write-result-report.tsx`, `is-clean-report.ts`, tests);
`src/features/log-media/log-confirm-sheet.tsx`;
`src/features/watchlist-media/copy.ts` (`isCleanWatchlistReport` →
`isCleanWriteReport`, re-exported or updated at call sites).
**Approach:** move, don't rewrite. `ManualWriteRows` gains R5's **disabled row
with a reason** shape, since it now carries the case that used to live on the
details screen: provider icon, label, reason line, external-link affordance.
`WriteResultReport` renders plan 0031 U8's three families over any
`ProviderWriteReport`, with the verb string (`'Log on'` / `'Add on'` /
`'Remove on'`) passed in — `OutcomeLink` already takes `verb`.
**Mechanical, no behaviour change — land it before the new sheet.**
**Test scenarios:** `LogConfirmSheet`'s existing tests pass unmodified except for
import paths; manual rows still never affect `canConfirm`; reconcile-skips and
reasoned skips still render differently; `manualLinkForOutcome` still has no
home-URL fallback while upfront rows still do.

#### U3. The watchlist picker sheet

**Goal:** the watchlist add and remove verbs confirm through the shared picker.
**Requirements:** R1, R3, R4, R5, KTD-3, KTD-4.
**Files:** `src/features/watchlist-media/watchlist-picker-sheet.tsx` (new) + test;
`watchlist-media-button.tsx`; `copy.ts`; the removal entry point
(`use-unwatchlist-media.ts`'s consumer in `src/app/watchlist/index.tsx` /
`src/features/card-actions/card-actions-sheet.tsx`).
**Approach:** the button's press opens the sheet; the sheet owns the selected-set
state and calls `mutate({ providers })`. It stays mounted through the write
(R4) and closes only on `isCleanWriteReport`, at which point U1's toast fires.
The **remove** verb composes the same sheet with `verb="Remove on"` copy and
plan 0031 R35's unknown-membership manual rows in the same `ManualWriteRows`
slot. Never a second stacked sheet over the card sheet — the card sheet's row
opens this one **in place of** itself.
**Test scenarios:** every applicable connected provider starts selected;
deselecting one narrows `mutate`'s `providers`; deselecting all disables confirm;
a manual-declared provider renders as a disabled row with a link and is never in
the selected set nor in `providers`; a clean report closes the sheet and fires
one toast; a mixed report keeps it open, renders the failed provider and its
link, and fires **no** success toast; the settled label still derives from
`useIsWatchlisted`; the shared pending guard still blocks a second confirm from a
different mounted instance.

#### U4. Retire the inline result surfaces

**Goal:** one result idiom app-wide; the persistent rows are gone from details.
**Requirements:** R9, R10, R11, R12, R13.
**Files:** `src/features/watchlist-media/watchlist-media-button.tsx`,
`src/features/log-media/log-media-button.tsx`,
`src/features/log-media/log-confirm-sheet.tsx`, plus tests.
**Approach:** delete the three-family block from `WatchlistMediaButton` (it lives
in the sheet now) and the success lines from both log surfaces, replacing them
with the toast. Remove the now-duplicate `haptics.success()`/`haptics.error()`
calls at those call sites — `burnt` fires the haptic (R10). The **upfront manual
rows leave the details screen entirely** (R11): their content is now a picker
row, reachable at the moment of the write.
**Test scenarios:** a details screen with Letterboxd connected on web renders
**no** standing `Add on Letterboxd` row, and opening the picker shows Letterboxd
as a disabled row with its reason and link; a successful log fires one toast and
no inline success line; haptics fire once, not twice; nothing in the merged
watchlist grid's inline per-provider notice changes.

---

## Verification

- `bun test`, `bun typecheck`, `bun lint`, `bun check:classnames`,
  `bun check:router-push`.
- **Clean prebuild required** (KTD-5): `bun ios.clean` / `bun android.clean`.
  State it in the PR body per AGENTS.md § CNG.
- Manual, all four targets: watchlist an unreleased film → the picker opens with
  every connected provider selected → confirm → sheet closes, one toast names
  where it landed. Deselect one → only the rest are written. On **web** with
  Letterboxd connected → Letterboxd is a disabled picker row with its reason and
  a working link, and the details screen carries no standing row. Force a failure
  (disconnect mid-write / an expired session) → the sheet stays open with the
  failed provider and its link, and no success toast fires.
- Android specifically: capture what the toast actually looks like and record it
  (KTD-2's named risk).

## Follow-Ups

- **Undo on removal**, if `burnt` ever grows a press handler or the app grows a
  toast of its own. Not expressible today (R7).
- **Dropping the web-Letterboxd affordance entirely** (R13) — one line in the
  picker plus the AGENTS.md amendment, if the owner wants it after living with
  the picker row.
- **`lib/toast.android.ts`**, only if U1's Android observation demands it
  (KTD-2).
