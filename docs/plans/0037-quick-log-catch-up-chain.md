---
title: Quick-Log Catch-Up Chain - Plan
type: feature
date: 2026-09-10
artifact_contract: ce-unified-plan/v1
artifact_readiness: implemented
product_contract_source: owner-decisions
execution: code
---

# Quick-Log Catch-Up Chain - Plan

## Goal Capsule

- **Objective:** When the Continue Watching checkmark logs an episode of a show
  the user is several episodes behind on, keep the same sheet open and step it
  to the next aired-but-unwatched episode — same providers, date and tags — with
  a Family-drawer-style in-place transition, until the backlog is done.
- **Authority:** AGENTS.md overrides this plan where they conflict. Inherited
  non-negotiables: the single `useLogMedia` fan-out (plan 0019 R7), nothing
  advances optimistically (plan 0019 KTD-6), per-provider partial failure with
  manual links (plan 0022), plan 0032's toast/sheet split (R7), and Simkl's
  write-lock discipline (`docs/solutions/simkl-rate-limits-and-write-lock.md`).
- **Stop conditions:** stop and surface if a provider needs the chain to be a
  single batched write (it would change Serializd's per-episode diary
  semantics), or if the Simkl lock turns out not to be coalescable.

---

## Product Contract

### Problem Frame

Owner request, 2026-09-10. The card already says "5 behind"; logging episode 1
closes the sheet, the card advances after a refetch, and the user re-opens the
same sheet four more times with the same tags and providers. The app knows the
whole intent from the first tap.

### Requirements

- R1. After a confirm, the sheet stays open and offers the next
  aired-but-unwatched episode of the same show, in the entry's own numbering
  domain (seasoned for Trakt/Simkl TV, entry-relative for AniList/Simkl anime).
- R2. Providers, watched-on date and tags carry over between episodes.
- R3. The chain never offers an episode the source can't prove exists and has
  aired: Trakt's aired list minus completed keys; Simkl's watched keys, aired
  arithmetic and the tracker's season layout; AniList's exact behind-count. No
  layout → no chain past the entry.
- R4. A one-episode chain is exactly the pre-existing sheet: confirm, spinner,
  close on a clean report, stay open otherwise.
- R5. Confirms are not gated on the previous write landing. Each fired write
  reports into a ledger in the sheet as it lands; the last episode is awaited.
- R6. Five confirms in ten seconds must not fail on Simkl's ~20s per-user
  write lock: Simkl legs inside the lock coalesce into one POST when it lifts.
- R7. Two logs of the same AniList entry never land out of order (its progress
  is one counter).
- R8. The sheet survives its own card unmounting (a logged episode re-keys the
  Continue Watching row).
- R9. Every outcome is visible somewhere: in the ledger while the sheet is
  open (failures with their manual links), as a toast if it lands after the
  sheet was dismissed.
- R10. Transition: title, count and button label morph in place on web; the
  header slides in and the sheet animates its height on native; the web sheet
  animates its height too instead of snapping.

### Scope Boundaries

- Deferred: the details screen's "Log episode N" button (`log-media-button`)
  and the season pickers keep their one-write sheets; a "retry" affordance on
  an earlier failed ledger row (the manual link covers it); routing Simkl
  *watchlist* writes through the same lock gate.
- Out of scope: batching a chain into one Serializd write (would drop its
  per-episode diary entries and tags), a bundled retry inside the lock window.

---

## Planning Contract

### Key Technical Decisions

- KTD-1. **App-level session, not card state.** `CatchUpLogProvider` +
  `CatchUpLogSheet` mounted in `app/_layout.tsx` beside the lightbox; the
  checkmark only calls `openCatchUp(entry)` and reads `useQuickLogBusy(itemId)`.
  Rationale: R8 — the card's entry id carries the episode number, so an
  advanced card unmounts; a card-owned sheet died mid-chain.
- KTD-2. **Queue planned once from source evidence** (`catch-up/queue.ts`,
  pure, tested) and frozen at the first confirm. Trakt's normalizer now carries
  `airedEpisodes` (every listed = aired episode, in order) so its chain is
  exact across gaps and season boundaries. Evidence is fetched only when the
  entry is chainable (`episodesBehind > 1`) and only what the source needs.
- KTD-3. **Decoupled writes, awaited last.** Concurrent `useLogMedia`
  mutations per episode; the sheet form advances immediately. Serializd keeps
  its per-episode diary entries because each episode is still its own log.
- KTD-4. **Simkl write-lock coalescer** (`features/log-media/simkl-write-lock.ts`):
  one app-wide queue every Simkl history write passes through. A write inside
  the lock waits and joins the next POST; `logToSimkl` folds same-item entries
  into one `seasons[].episodes[]`. A lock bounce is re-queued once. This is a
  root-cause fix for a pre-existing failure too: any two logs within 20s of
  each other used to fail on Simkl.
- KTD-5. **AniList adapter serialized** app-wide (R7). Trakt/Serializd/
  Letterboxd write per episode and need no ordering.
- KTD-6. **Motion**: `MorphText` title/count and `morphLabel` buttons (web
  morph, native swap); native header keyed per episode with a 12px slide;
  ledger rows use the `FadeIn` preset (a custom keyframe would pin them out of
  flow on web); the web sheet panel gets a content-driven explicit height with
  a CSS transition, and the rise keyframe moved to a full-height wrapper so
  Reanimated's web snapshot pinning no longer freezes the panel's top edge.

### Verification

- `bun test`: queue derivations per source, the coalescer's timing/retry
  contract, Simkl same-item folding, Trakt `airedEpisodes`.
- Browser (Playwright + installed Chrome, Simkl intercepted): five-episode
  chain at desktop and phone width — two POSTs total, the second carrying
  episodes 3–5 in one item; failure path keeps the sheet open with the reason;
  dismissal mid-chain toasts the late result. Frames confirmed the digit
  morph, bottom-anchored growth and the awaited last write.
