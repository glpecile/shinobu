# Plan 009: A Simkl log that can't be built is skipped on its own, never coalesced into a batch

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- src/lib/providers/simkl/writes.ts src/features/log-media/use-log-media.ts src/features/log-media/use-log-media.test.ts src/features/log-media/simkl-write-lock.ts`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (if plan 005 is in flight, both edit `use-log-media.ts`; rebase, the hunks don't overlap)
- **Category**: bug
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

Simkl has a ~20 s per-user write lock. `createSimklLogQueue` therefore merges
writes that arrive while the lock is held into **one** POST, and resolves
**every** waiter with that POST's single result
(`docs/solutions/simkl-write-lock-coalescing.md` chose this on purpose).

`logToSimkl` *drops* entries it can't build (no Simkl-resolvable id, an anime
batch with no ani.zip table) and still POSTs the rest. When anything lands, it
returns `{ status: 'ok', reason: '<dropped reason>' }`. So when an unbuildable
entry A is coalesced with a good entry B (common in the quick-log catch-up
chain), A's waiter gets `ok`. A is counted as succeeded: it triggers cache
invalidation and shows "Logged on Simkl", but nothing was written, and the
manual-link fallback (AGENTS.md "Never a dead-end error") never appears.
Alone, A would have been a reasoned `skipped` with the link.

The drop decision depends only on the entry itself, so it can run before the
entry joins the queue. After this plan, the adapter checks first, and an
unbuildable entry returns its own `skipped` result without ever being queued.

## Current state

- `src/lib/providers/simkl/writes.ts` — `logToSimkl` (~line 275) and its private helpers `skip` (~55), `categoryFor` (~69), `idsFor` (~87), `animeEpisodeNumbers` (~169).
- `src/features/log-media/use-log-media.ts` — `simklLogAdapter` (~line 207) and the module-level `simklLogQueue` (~239).
- `src/features/log-media/simkl-write-lock.ts` — the queue. **Not changed.**
- `src/features/log-media/use-log-media.test.ts` — `describe('the Simkl leg of the log fan-out (plan 0034 U6)')` (~line 406). It already calls `simklLogAdapter(queryClient, (entry) => { … })` with an injected `log` spy.

The drop logic inside `logToSimkl`'s loop today (abridged):

```ts
  for (const entry of entries) {
    const { item, watchedAt } = entry;
    const category = categoryFor(item);
    const ids = category == null ? null : idsFor(item);
    if (category == null || ids == null) {
      dropped.push(
        category == null
          ? `media type ${item.type} does not route to Simkl (routing.ts should have filtered it)`
          : `"${item.title}" has no Simkl-resolvable id (simkl/tmdb/imdb for movies & TV, simkl/mal for anime)`,
      );
      continue;
    }
    ...
    if (item.type === 'ANIME') {
      const numbers = animeEpisodeNumbers(entry);
      if (typeof numbers === 'string') {
        dropped.push(numbers);
        continue;
      }
      ...
    }
    // TV
    const batch = entry.episodes?.length ? entry.episodes : entry.episode != null ? [entry.episode] : [];
    if (batch.length === 0) {
      dropped.push(`logging "${item.title}" to Simkl requires an episode (season/number)`);
      continue;
    }
    shows.push(...);
  }
```

(The movie / anime-film branch never drops after the ids check.)

The adapter today ends with:

```ts
    return log({
      item,
      ...(episode != null ? { episode } : {}),
      ...(episodes != null ? { episodes } : {}),
      ...(entryEpisodes != null ? { entryEpisodes } : {}),
      ...(watchedAt != null ? { watchedAt } : {}),
      episodeMap,
    });
```

## Commands you will need

| Purpose   | Command                                                   | Expected on success |
|-----------|-----------------------------------------------------------|---------------------|
| Install   | `bun install --frozen-lockfile`                           | exit 0              |
| Typecheck | `bun typecheck`                                           | exit 0              |
| Tests     | `bun test src/lib/providers/simkl/writes.test.ts src/features/log-media/use-log-media.test.ts` | all pass |
| All tests | `bun run test`                                            | all pass (never plain `bun test`) |
| Lint      | `bun lint`                                                | exit 0              |

## Scope

**In scope**:
- `src/lib/providers/simkl/writes.ts`
- `src/features/log-media/use-log-media.ts` — `simklLogAdapter` only
- `src/features/log-media/use-log-media.test.ts`

**Out of scope**:
- `simkl-write-lock.ts`: sharing one POST result is the documented design.
- Per-item attribution of a partial `not_found` from Simkl's response. It
  needs id matching against Simkl's response and is deferred (see maintenance notes).
- `logToSimkl`'s external behaviour: keep dropping inside the batch as a
  defence, so its existing tests stay green.

## Git workflow

- Branch: `fix/simkl-unbuildable-entry`
- One commit: `fix(log): skip an unbuildable Simkl entry before it joins a batch`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract the drop decision

In `writes.ts`, add and export:

```ts
/**
 * Why `logToSimkl` would drop this entry, or null when it can be written.
 * Depends only on the entry, so the log queue asks before coalescing: an
 * unbuildable entry must report its own skip, not ride a batch's `ok`.
 */
export function simklEntryDropReason(entry: SimklLogEntry): string | null {
  // same checks, same strings, same order as the loop
}
```

Move the four drop checks into it, with the exact same reason strings:
category/ids, anime `animeEpisodeNumbers` returning a string, and the TV empty
batch. Then make the loop in `logToSimkl` call it first:

```ts
    const reason = simklEntryDropReason(entry);
    if (reason != null) {
      dropped.push(reason);
      continue;
    }
```

The rest of each branch keeps building the payload. It may call `categoryFor`,
`idsFor` and `animeEpisodeNumbers` again, since they are pure. Use non-null
assertions only where the type system needs them after the guard, or restructure
so it doesn't. Don't change any reason text.

**Verify**: `bun test src/lib/providers/simkl/writes.test.ts` → all pass,
unchanged. `bun typecheck` → exit 0.

### Step 2: Check before queueing

In `simklLogAdapter` (`use-log-media.ts`), build the entry object into a const
`entry`, then:

```ts
    const dropReason = simklEntryDropReason(entry);
    // An unbuildable entry would be dropped inside a coalesced POST and inherit
    // the other entries' ok; alone it is a reasoned skip with the manual link.
    if (dropReason != null) return { status: 'skipped', reason: dropReason };
    return log(entry);
```

Import `simklEntryDropReason` next to the existing `logToSimkl` import.

**Verify**: `bun typecheck` → exit 0. `bun lint` → exit 0.

### Step 3: Test the adapter branch

In the `the Simkl leg of the log fan-out (plan 0034 U6)` describe, add one test:

- An item with no Simkl-resolvable id, e.g. a `MOVIE` with `externalIds: {}`.
  Build a full `NormalizedMediaItem` like the other fixtures in the file.
- `const calls: unknown[] = [];`
  `const adapter = simklLogAdapter(client(), (entry) => { calls.push(entry); return Promise.resolve({ status: 'ok' as const }); });`
- `const result = await adapter({ item });`
- Expect `calls` to have length 0 and `result` to match
  `{ status: 'skipped', reason: expect.stringContaining('no Simkl-resolvable id') }`.

**Verify**: `bun test src/features/log-media/use-log-media.test.ts` → all pass.

## Test plan

- One new adapter case (above). The existing `writes.test.ts` case
  `'an entry with no Simkl-resolvable id is a reasoned skip'` already pins the
  in-batch drop, so add no `simklEntryDropReason` unit test.
- `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0
- [ ] `grep -n "export function simklEntryDropReason" src/lib/providers/simkl/writes.ts` → 1 match
- [ ] `git diff --stat` touches only the three in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- Any reason string would have to change to make the extraction work.
- A `writes.test.ts` case changes outcome after step 1.
- `simklLogAdapter` has been moved or restructured since this plan.

## Maintenance notes

- Still shared after this plan: a **partial** `not_found` from Simkl's
  response. If A's ids are valid but Simkl doesn't know them, A and B both
  get `ok` with "Simkl could not match 1 of 2 submitted items". Fixing that
  means matching `not_found` ids back to entries. Do it only if users report it.
- Any new drop rule added to `logToSimkl` must go into `simklEntryDropReason`,
  or it reintroduces this bug.
