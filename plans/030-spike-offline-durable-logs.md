# Plan 030 (direction spike): Design restart-safe offline logging (#208)

> **Executor instructions**: This is a **design spike**. You write a design
> document and may run local, read-only experiments. You change no production
> code. Follow the steps; if anything in "STOP conditions" occurs, stop and
> report. When done, update this plan's row in `plans/README.md` unless a
> reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- src/state/queries/persist.ts src/state/queries/persist-provider.tsx src/features/log-media src/state/queries/query-client.ts`
> Changes are fine. Re-read the current versions before writing the design.

## Status

- **Priority**: direction (owner's call)
- **Effort**: S–M for the spike; L for the feature (coarse estimate)
- **Risk**: LOW for the spike; MED–HIGH for the feature (replay can duplicate a log or write to the wrong account)
- **Depends on**: none. Better after plans 005 and 014 land, since replay re-runs reconcile.
- **Category**: direction
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

Shinobu has no server. A log made without network (a commute, a flight, a bad
cell) fails, or sits paused in memory and is lost when the app is killed.
Nothing can replay it later, so the client is the only place durability can
live. The owner already tracks this as GitHub issue #208. `todos/README.md`
says: "Open, partial. Allowlisted cached reads persist; durable write replay
does not ship. Plan the smallest restart-safe action with per-provider outcomes
and account/duplicate protections." This spike produces that plan.

## Current state (evidence)

- `src/state/queries/persist.ts`: the persister dehydrates **queries** only. `grep -rn "shouldDehydrateMutation\|resumePausedMutations" src` returns nothing.
- `src/features/log-media/use-log-media.ts`: `useLogMedia` = enrich → route → reconcile (`providerHasWatch`) → `fanOutLog`. It returns per-provider outcomes (`LogMediaResult`).
- In-memory write queues already exist: `src/features/log-media/simkl-write-lock.ts` (Simkl's ~20 s write lock) and `src/features/log-media/anilist-write-queue.ts`.
- Reconcile already prevents double-logging when a provider already has the
  watch. That is the natural duplicate guard for a replay. Plans 005 and 014
  fix two cases where it misfires.
- AGENTS.md: "A failed write reaches the caller as that provider's result, never a boolean or a throw", and "Never a dead-end error".
- TanStack Query v5 supports persisting paused mutations through
  `PersistQueryClientProvider` with `dehydrateOptions.shouldDehydrateMutation`
  plus `onSuccess: () => queryClient.resumePausedMutations()`. A mutation is
  only resumable if its `mutationFn` is registered by `mutationKey` via
  `queryClient.setMutationDefaults`. Confirm this against the installed
  version's docs in `node_modules/@tanstack/query-core`.

## Steps

### Step 1: Map what "offline" does today

Read `useLogMedia`, the confirm sheet (`log-confirm-sheet.tsx`) and
`src/state/queries/query-client.ts` (check `networkMode` for mutations). Answer
in the doc: when the device is offline and the user confirms a log, does the
mutation fail immediately, pause, or hang? What does the user see? If you can
run `bun web` and toggle offline in devtools, observe it and note what you saw.
Don't log against real accounts while experimenting. Use a provider-less build
or stop at the confirm step.

**Verify**: a short "today" section with the observed or code-derived behaviour.

### Step 2: Write the design doc

Create `docs/plans/<next free number>-offline-log-replay.md` (check
`ls docs/plans | tail -3`; plan 029 may have taken 0115). Follow the structure of
a recent plan there. Cover:

- **Smallest restart-safe unit**: a persisted "pending log" record (variables
  plus the connected account identity per provider plus a created-at), not a
  dehydrated TanStack mutation, *or* the TanStack mechanism. Recommend one,
  with trade-offs: TanStack ties replay to `setMutationDefaults` and the hook's
  closure inputs (`connected` providers, `queryClient`).
- **Account protection**: store each target provider's account identity at
  enqueue time (AniList viewer id, Trakt/Simkl username, Letterboxd and
  Serializd usernames). Drop or ask instead of replaying if it changed.
- **Duplicate protection**: replay re-runs reconcile. A provider that now has
  the watch is skipped (with plan 014's `retryOf` semantics, so it never becomes a rewatch).
- **Outcomes**: how replayed per-provider results reach the user (toast on
  next launch; the diary shows a pending badge?). Keep "never a dead end":
  failures still link out.
- **Ordering and limits**: Simkl's write lock, AniList's 30 req/min budget,
  max queue age (e.g. 7 days), and what happens when a pending log's item is logged again manually.
- **Open questions** for the owner, each with a recommended answer.

**Verify**: the doc exists with those sections.

## Done criteria

- [ ] `docs/plans/<n>-offline-log-replay.md` exists with the sections above
- [ ] No file under `src/` changed
- [ ] `plans/README.md` row updated (DONE plus the recommended approach in one line)

## STOP conditions

- Observing offline behaviour would require logging to a real account. Derive it from code instead.
- The installed TanStack version can't persist mutations the way described.
  Note it in the doc and recommend the custom pending-log record.

## Maintenance notes

- Whatever ships must go through `useLogMedia`'s reconcile. A raw adapter replay would bypass the duplicate guard.
