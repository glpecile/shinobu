# Plan 006: Disconnecting a provider also drops the cached unified diary

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- src/state/session/index.ts src/state/session/disconnect.test.ts src/state/queries/diary-pages.ts`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (account isolation / privacy)
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

`disconnectProvider` clears a provider's token and removes its cached reads so
a reconnect (possibly as a different account) never shows the old account's
data. It already handles the two merged caches whose keys don't name a provider
(Up Next and the watchlist). The unified diary is a third such cache and is
missed. Its key holds the provider *set* plus the Letterboxd and Serializd
usernames, but not the Trakt, AniList or Simkl account. So "disconnect Trakt,
connect a different Trakt account" restores the first account's diary from
memory, and on native from disk (it is persisted for 24 h). The stale entries
also feed details resolution (`findInDiaryCache`) and Serializd's
"already logged" check (`cachedDiaryEntries`).

## Current state

- `src/state/session/index.ts` — `disconnectProvider` (~lines 84–107).
- `src/state/queries/diary-pages.ts:25` — `export const DIARY_QUERY_ROOT = ['diary'] as const;`
  This module is RN-free and Effect-free (it imports only types, `@/features/diary/merge`
  and `@/lib/providers/types`), so `state/session` can import it without a cycle.
- `src/state/session/disconnect.test.ts` — the purge contract test.

`disconnectProvider` today:

```ts
export function disconnectProvider(queryClient: QueryClient, id: ProviderId): void {
  clearProviderSession(id);
  if (id === 'simkl') {
    clearSimklAuthFlow();
  }
  queryClient.removeQueries({ queryKey: [id] });
  // Up Next is the exception to "every root is a provider id": ...
  queryClient.removeQueries({ queryKey: [...UP_NEXT_QUERY_ROOT] });
  // The second exception, for the same reason (plan 0031 U13): ...
  queryClient.removeQueries({ queryKey: [...WATCHLIST_QUERY_ROOT] });
}
```

The diary key builder (`diary-pages.ts`):

```ts
  feed: (providers, letterboxdUsername, serializdUsername) =>
    [...diaryQueryKeys.feedRoot(), providers.join(','), letterboxdUsername, serializdUsername] as const,
  filmPlays: (providers, ids) => [...DIARY_QUERY_ROOT, 'film-plays', providers.join(','), ids] as const,
```

The existing test `"clears the token, every ['simkl']-rooted query and the merged caches"`
in `disconnect.test.ts` seeds `watchlistKey` and `upNextKey` and asserts they are gone.

## Commands you will need

| Purpose   | Command                                           | Expected on success |
|-----------|---------------------------------------------------|---------------------|
| Install   | `bun install --frozen-lockfile`                   | exit 0              |
| Typecheck | `bun typecheck`                                   | exit 0              |
| One file  | `bun test src/state/session/disconnect.test.ts`   | all pass            |
| All tests | `bun run test`                                    | all pass (never plain `bun test`) |
| Lint      | `bun lint`                                        | exit 0              |

## Scope

**In scope**:
- `src/state/session/index.ts`
- `src/state/session/disconnect.test.ts`

**Out of scope**:
- Changing the diary query key shape (adding account ids). That would also need
  a persist `BUSTER` bump; the purge is enough.
- Purging on automatic session loss (a 401 that clears the token). That is
  plan 013.

## Git workflow

- Branch: `fix/disconnect-purges-diary`
- One commit, e.g. `fix(session): drop the merged diary on disconnect`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Purge the diary root

In `src/state/session/index.ts`:

- `import { DIARY_QUERY_ROOT } from '@/state/queries/diary-pages';`
  (group it with the other `@/state/queries/*` imports).
- After the watchlist purge, add:

```ts
  // The third exception: the unified diary's key names the provider set and
  // two usernames, not the Trakt/AniList/Simkl account, and it is persisted
  // on native. Reconnecting as another account must not restore it.
  queryClient.removeQueries({ queryKey: [...DIARY_QUERY_ROOT] });
```

**Verify**: `bun typecheck` → exit 0.

### Step 2: Extend the existing purge test (no new test)

In `disconnect.test.ts`, in the test
`"clears the token, every ['simkl']-rooted query and the merged caches"`:

- Import `DIARY_QUERY_ROOT` the same way the file imports the other roots:
  `const { DIARY_QUERY_ROOT } = await import('@/state/queries/diary-pages');`
- Seed `const diaryKey = [...DIARY_QUERY_ROOT, 'feed', 'simkl,trakt', '', ''];`
  with `queryClient.setQueryData(diaryKey, { pages: [], pageParams: [] });`
- After `disconnectProvider`, add
  `expect(queryClient.getQueryData(diaryKey)).toBeUndefined();`
- Update the comment "Both hold every provider's rows…" to say "All three".

**Verify**: `bun test src/state/session/disconnect.test.ts` → all pass.
Revert step 1 temporarily (`git stash push src/state/session/index.ts`) and
rerun → the diary assertion fails. Restore with `git stash pop`.

## Test plan

- One assertion added to the existing purge test (AGENTS.md: extend the test
  that already pins the branch, never add a second).
- `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0
- [ ] `grep -n "DIARY_QUERY_ROOT" src/state/session/index.ts` shows the import and the `removeQueries` call
- [ ] Only the two in-scope files changed (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `bun typecheck` or the test run reports an import cycle or a module that
  can't load under bun after importing `diary-pages` into `state/session`.
- `disconnectProvider` already removes `['diary']` (fixed independently).

## Maintenance notes

- Any new merged cache whose key doesn't start with a provider id must be added
  here too. The three are Up Next, watchlist and diary.
- Plan 013 routes automatic session loss through this same purge; land this first.
