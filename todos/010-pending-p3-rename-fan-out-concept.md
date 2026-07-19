---
status: pending
priority: P3
---

# Brainstorm a New Name for the "Fan-Out" Concept

"Fan-out" is the internal name for the core write path: one log routed to every
connected, applicable tracker in parallel. The behavior stays exactly as is —
this is purely a naming exercise. Gian dislikes the term (2026-07-19); it has
already been removed from all user-facing copy (hero, meta description, README
tagline — the public framing is now "harness"/"stays in sync"), but it remains
the architecture vocabulary everywhere internal.

## Task

Write a `docs/brainstorms/` doc proposing candidate names and pick one. The
name should describe "one write, dispatched to N trackers, with per-tracker
partial-failure reporting." Directions worth exploring: the sync/harness
framing the public copy already uses, dispatch/broadcast/relay/mirror
metaphors, or something on-brand (忍/ninja vocabulary — e.g. bunshin/clone
techniques) — judged against grep-ability and how well it reads in identifiers
(`fanOutLog`, `fan-out.ts`).

## Scope of the eventual rename

- `src/features/log-media/fan-out.ts` (+ `fanOutLog`, imports in
  `use-log-media.ts`)
- Code comments across `lib/providers/*` and `features/log-media/*`
- `AGENTS.md` ("Providers, Sessions & Log Fan-Out" section and scattered
  mentions)
- `docs/plans/` and `todos/005-pending-p1-unified-log-fanout.md`

## Acceptance Criteria

- A `docs/brainstorms/` doc with candidates, trade-offs, and a decision.
- Rename lands as its own mechanical PR after the decision — no behavior
  change mixed in.
