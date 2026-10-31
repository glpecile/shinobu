# Plan 029 (direction spike): Design "undo this log" across providers

> **Executor instructions**: This is a **design spike**. You write a design
> document and run read-only probes. You change no production code. Follow the
> steps; if anything in "STOP conditions" occurs, stop and report. When done,
> update this plan's row in `plans/README.md` unless a reviewer told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- src/lib/providers/registry.ts src/features/log-media src/lib/providers/*/writes.ts`
> Changes are fine. Re-read the current versions before writing the design.

## Status

- **Priority**: direction (owner's call; not ranked against bugs)
- **Effort**: S for the spike; the feature itself is L (coarse estimate)
- **Risk**: LOW for the spike; MED–HIGH for the feature (removal is destructive on some providers)
- **Depends on**: none. It doesn't compete with #227 pause/drop, the owner's next feature (`todos/README.md`).
- **Category**: direction
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

A log fans out to up to three providers at once. Nothing reverses it: a
mis-tap, the wrong episode, or the wrong cour is fixed by hand on each tracker.
That is the friction `plan.md` opens by promising to remove ("energy
keystrokes"). The building blocks partly exist: AniList's
`DeleteMediaListEntry` and Simkl's `POST /sync/history/remove` are already
used for watchlist removal, and the registry already models per-verb support
(`watchlistWrite` / `watchlistRemove: 'write' | 'manual' | 'none'`). Logs have
only `canWrite`. This spike decides whether an "Undo" on the post-log toast is
feasible per provider, and what it would cost.

## Current state (evidence)

- `src/lib/providers/registry.ts`: each provider declares `canWrite`,
  `watchlistWrite`, `watchlistRemove` (e.g. Serializd `watchlistRemove: 'manual'`).
  `WriteSupport` (`src/lib/providers/types.ts`) is three-state on purpose; read its docblock.
- `src/lib/providers/anilist/writes.ts:~221-354`: `DeleteMediaListEntry` (takes the MediaList **entry** id).
- `src/lib/providers/simkl/writes.ts:~477-545`: `/sync/history/remove`, with a
  guard (`allowDestructive`) because it also deletes watch history.
- `src/features/log-media/fan-out.ts`: the generic `runProviderWrites<V>` core
  that the watchlist verbs reuse ("verb-neutral", plan 0031 KTD-4).
- `grep -rni "undo" src` returns nothing today.
- AGENTS.md: "Never a dead-end error": an action a provider can't do links to the item there (`providerItemUrl`).

## Steps

### Step 1: Per-provider capability table (read-only)

For each provider (Trakt, Simkl, AniList, Letterboxd, Serializd), determine
from code and official API docs whether a **single just-written log** can be
removed precisely:

- Trakt: `POST /sync/history/remove` by history id (does the log response return the id?).
- Simkl: `/sync/history/remove` removes *all* plays of an item or episode, not one. Is that acceptable for undoing the latest?
- AniList: a log changes `progress`/`status`/`repeat`. Undo means restoring the previous values, not deleting the entry. Is the pre-write state available? (`entryState` is read during reconcile.)
- Letterboxd: the diary entry id from the write receipt (native WebView and userscript). Is there a delete endpoint the session can call?
- Serializd: `episode_log/remove` and `watched/remove_v2` are already allowlisted in `worker/serializd-proxy.ts`.

Use the provider docs and the existing write code. **Do not** call any write
or remove endpoint against a real account.

**Verify**: a 5-row table with `undo: 'write' | 'manual' | 'none'` per
provider, each with a one-line justification and a source link.

### Step 2: Write the design doc

Create `docs/plans/0115-undo-log.md`. Check `ls docs/plans | tail -3`; if 0115
is taken, use the next free number. Follow the structure of a recent plan
there (e.g. `docs/plans/0114-serializd-coming-soon-row.md`). Include:

- the capability table from step 1, proposed as a registry field (`logUndo: WriteSupport`)
- the UX: an "Undo" action on the post-log toast (`src/lib/toast`) for N
  seconds, applied only to providers that **succeeded** in that round, with a
  manual link for `'manual'` ones
- what state must be captured at write time (ids from receipts, AniList's previous progress and status)
- risks: Simkl's coarse removal, Trakt duplicate-play edge cases, the catch-up chain (does undo apply per episode?), offline
- open questions for the owner, each with a recommended answer.

**Verify**: the doc exists, has the table, UX, captured-state and open-questions sections.

## Done criteria

- [ ] `docs/plans/<next>-undo-log.md` exists with the sections above
- [ ] No file under `src/` or `worker/` changed
- [ ] `plans/README.md` row updated (DONE plus a one-line verdict: feasible on N/5 providers)

## STOP conditions

- Testing a removal endpoint would require a real account write. Don't do it; document it as an open question.
- Fewer than two providers can undo precisely. Write the doc anyway, with
  the verdict "not worth building", and say so in the README row.

## Maintenance notes

- If built, the undo verb should reuse `runProviderWrites` like the watchlist
  verbs, and plan 023's Effect-boundary rule applies to its hook.
