# Plan 013: Losing or gaining a session keeps the query cache in step, not just a manual disconnect

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- src/state/session/index.ts src/state/session/tokens.ts src/state/session/disconnect.test.ts src/app/_layout.tsx`
> If any of these changed since this plan was written (other than plan 006's
> one-line diary purge in `index.ts`), compare the "Current state" excerpts
> against the live code before proceeding; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (a cache purge on the wrong event would cost a cold reload)
- **Depends on**: plans/006-disconnect-purges-diary.md (this plan reuses that purge list)
- **Category**: bug
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

Two cache problems share one cause: only the manual "Disconnect" button touches
the query cache, so other changes to the session store leave it stale.

1. **A token that dies is cleared without a purge.** AniList clears its session
   on any `ProviderAuthError`, and Trakt clears it when a refresh grant is
   rejected. `disconnectProvider` never runs on either path. The dead account's
   rows stay in Up Next, the watchlist, the diary and every provider-rooted
   query, on disk too. AniList's `viewer` (the account id) is cached forever and
   persisted, so reconnecting AniList as a **different** account keeps reading
   lists by the old account id while writes go to the new token.
2. **Connecting a provider doesn't refresh the merged watchlist or Up Next.**
   Both are cached under keys that don't name the connected providers
   (`['watchlist','inputs']` for 15 minutes, `['up-next','inputs']`). A newly
   connected tracker's watchlist rows (and `useIsWatchlisted`) stay missing until
   the next refetch, up to 15 minutes. Today the connect listener only shows a toast.

After this plan, a small root component subscribes to the session store. When a
`session.<id>` key disappears it runs the same purge as `disconnectProvider`.
When one appears for a provider that wasn't connected it invalidates the two
merged gathers. A token refresh (an overwrite of an existing session) does nothing.

Revision (#386 review): invalidating isn't enough on its own. It refetches an
active gather at once, before React re-renders it, and the gather's `queryFn`
captured the old provider list, so it finished fresh without the new
provider's rows. `upNextOptions` and `watchlistOptions` now read the usable
providers when each fetch starts (`currentUsableProviders`), and the test
drives both through an active `QueryObserver`.

## Current state

`src/state/session/index.ts`, `disconnectProvider` (after plan 006 lands, it
also removes `[...DIARY_QUERY_ROOT]`):

```ts
export function disconnectProvider(queryClient: QueryClient, id: ProviderId): void {
  clearProviderSession(id);
  if (id === 'simkl') {
    clearSimklAuthFlow();
  }
  queryClient.removeQueries({ queryKey: [id] });
  queryClient.removeQueries({ queryKey: [...UP_NEXT_QUERY_ROOT] });
  queryClient.removeQueries({ queryKey: [...WATCHLIST_QUERY_ROOT] });
  // + plan 006: queryClient.removeQueries({ queryKey: [...DIARY_QUERY_ROOT] });
}
```

`src/state/session/tokens.ts` (relevant parts):

```ts
const storage = createMMKV({ id: 'session' });
const keyFor = (id: ProviderId) => `session.${id}`;
const PROVIDER_KEY_PATTERN = /^session\.(.+)$/;
export function getProviderSession(id: ProviderId): ProviderSession | null { ... }
export function connectedProviderIds(): ProviderId[] { ... }
/** Subscribe to any session change, by key; returns an unsubscribe function. */
export function onSessionChange(listener: (key: string) => void): () => void {
  const subscription = storage.addOnValueChangedListener(listener);
  return () => subscription.remove();
}
```

`useConnectedProviders` already relies on `onSessionChange` firing for
same-process writes on native and web (`state/session/index.ts`).

The silent clears:
- `src/lib/providers/anilist/http.ts:~228`: `Effect.tapError((error) => error._tag === 'ProviderAuthError' ? Effect.sync(() => deps.tokens.clear()) : Effect.void)`
- `src/lib/providers/trakt/auth.ts:~87`: `Effect.catchTag('ProviderAuthError', () => Effect.sync(() => deps.tokens.clear()).pipe(...))`

The merged-gather key builders: `watchlistQueryKeys.inputs()` in
`src/state/queries/watchlist.ts` and `upNextQueryKeys.inputs()` in
`src/state/queries/up-next.ts`. Do **not** import those modules into
`state/session` (cycle: they read the session). Use the roots that already
exist for this reason: `UP_NEXT_QUERY_ROOT` (`state/queries/up-next-cache.ts`)
and `WATCHLIST_QUERY_ROOT` (`state/queries/watchlist-cache.ts`), and invalidate
`{ queryKey: [...ROOT, 'inputs'] }`. Confirm `'inputs'` is the second segment by
reading both `*QueryKeys.inputs` builders before writing it.

The root mount point is `src/app/_layout.tsx` (~line 167–170):

```tsx
                <NotificationsRuntime />
                {/* Warms the Up Next slot on launch and on every foreground
                    transition, so its waterfall overlaps app start. */}
                <UpNextPrefetch />
```

The exemplar for a render-nothing runtime component that subscribes in an
effect is `src/features/up-next/up-next-prefetch.tsx`. AGENTS.md allows
`useEffect` exactly for this: "`useEffect` subscribes to something outside
React and cleans up."

## Commands you will need

| Purpose   | Command                                          | Expected on success |
|-----------|--------------------------------------------------|---------------------|
| Install   | `bun install --frozen-lockfile`                  | exit 0              |
| Typecheck | `bun typecheck`                                  | exit 0              |
| One file  | `bun test src/state/session/disconnect.test.ts`  | all pass            |
| All tests | `bun run test`                                   | all pass (never plain `bun test`) |
| Lint      | `bun lint`                                       | exit 0              |

## Scope

**In scope**:
- `src/state/session/index.ts`
- `src/state/session/tokens.ts`: export `PROVIDER_KEY_PATTERN` only
- `src/state/session/disconnect.test.ts`
- `src/features/trackers/session-cache-sync.tsx` (create)
- `src/app/_layout.tsx`: one import plus one element next to `<UpNextPrefetch />`

**Out of scope**:
- Whether AniList *should* clear its token on every auth error (a product question; note it in your report if you think it's wrong).
- The provider transport files (`anilist/http.ts`, `trakt/auth.ts`). They keep calling `tokens.clear()`.
- Adding provider ids to the watchlist and Up Next keys (that would need a persist `BUSTER` bump).
- `onProviderConnected` and its toast.

## Git workflow

- Branch: `fix/session-cache-sync`
- One commit per step is fine. Message style: `fix(session): purge caches when a session disappears`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Split the purge out of `disconnectProvider`

In `state/session/index.ts`, extract the cache half:

```ts
/** Every cache a provider's session backs: its own root and the merged gathers. */
export function purgeProviderQueries(queryClient: QueryClient, id: ProviderId): void {
  queryClient.removeQueries({ queryKey: [id] });
  // (move the existing comments with these lines)
  queryClient.removeQueries({ queryKey: [...UP_NEXT_QUERY_ROOT] });
  queryClient.removeQueries({ queryKey: [...WATCHLIST_QUERY_ROOT] });
  queryClient.removeQueries({ queryKey: [...DIARY_QUERY_ROOT] });
}
```

`disconnectProvider` keeps `clearProviderSession(id)` and the Simkl flow clear,
then calls `purgeProviderQueries(queryClient, id)`. If plan 006 has not landed,
STOP. This plan assumes the diary line exists.

**Verify**: `bun test src/state/session/disconnect.test.ts` → all pass (no behaviour change yet).

### Step 2: The subscription

Still in `index.ts`, add:

```ts
/**
 * Keeps the query cache in step with the session store for changes the
 * Disconnect button doesn't make: a provider clearing a dead token purges like
 * a disconnect; a fresh connect marks the merged gathers stale so the new
 * provider's rows appear. A token refresh overwrites a live session and does
 * nothing. Returns the unsubscribe.
 */
export function syncQueryCacheWithSessions(queryClient: QueryClient): () => void {
  let known = new Set(connectedProviderIds());
  return onSessionChange((key) => {
    const id = PROVIDER_KEY_PATTERN.exec(key)?.[1] as ProviderId | undefined;
    if (id == null) return;
    const present = getProviderSession(id) != null;
    if (!present && known.has(id)) purgeProviderQueries(queryClient, id);
    if (present && !known.has(id)) {
      void queryClient.invalidateQueries({ queryKey: [...UP_NEXT_QUERY_ROOT, 'inputs'] });
      void queryClient.invalidateQueries({ queryKey: [...WATCHLIST_QUERY_ROOT, 'inputs'] });
    }
    known = new Set(connectedProviderIds());
  });
}
```

Import `connectedProviderIds`, `getProviderSession` and `PROVIDER_KEY_PATTERN`
from `./tokens`. `PROVIDER_KEY_PATTERN` exists there but isn't exported yet;
add `export` to its declaration (a one-word change in `tokens.ts`). Use `known.has` checks as
written. They make a manual disconnect, which purges and then fires the
listener, a harmless second purge.

**Verify**: `bun typecheck` → exit 0. `bun lint` → exit 0.

### Step 3: Mount it

Create `src/features/trackers/session-cache-sync.tsx`:

```tsx
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { syncQueryCacheWithSessions } from '@/state/session';

/** Mounted once at the app root: see `syncQueryCacheWithSessions`. Renders nothing. */
export function SessionCacheSync(): null {
  const queryClient = useQueryClient();
  useEffect(() => syncQueryCacheWithSessions(queryClient), [queryClient]);
  return null;
}
```

In `src/app/_layout.tsx`, import it with the `@/features/...` alias and render
`<SessionCacheSync />` right before `<UpNextPrefetch />`, with a one-line JSX
comment in the same style as its neighbours.

**Verify**: `bun typecheck` → exit 0. `bun lint` → exit 0. In particular, the
`react-you-might-not-need-an-effect` rules must not flag the effect. It
subscribes and returns the cleanup, which is the sanctioned use.

### Step 4: Tests

In `disconnect.test.ts`, make the MMKV mock notify listeners. Keep the shared
`store`, add `const listeners = new Set<(key: string) => void>();`, call every
listener with the key inside `set` and `remove`, and have
`addOnValueChangedListener(listener)` add it and return
`{ remove: () => listeners.delete(listener) }`. Clear `listeners` in `beforeEach`.

Add one `describe('syncQueryCacheWithSessions')` with exactly two cases:
1. **A cleared session purges.** `setProviderSession('anilist', {accessToken:'a'})`,
   seed `['anilist','viewer']` and `[...UP_NEXT_QUERY_ROOT,'inputs']`, start
   `syncQueryCacheWithSessions(queryClient)`, then call `clearProviderSession('anilist')`
   (import it from `./tokens`), which is what the transport's `tokens.clear()` does.
   Expect both keys gone. Unsubscribe at the end.
2. **A new connect invalidates the gathers; a refresh doesn't.** Seed
   `[...WATCHLIST_QUERY_ROOT,'inputs']`, start the sync, then
   `setProviderSession('trakt', …)`. Expect
   `queryClient.getQueryState(key)?.isInvalidated` to be `true`. Then reset with
   `queryClient.setQueryData(key, …)` (which clears the invalidated flag), call
   `setProviderSession('trakt', …)` again (a refresh), and expect `isInvalidated` `false`.

**Verify**: `bun test src/state/session/disconnect.test.ts` → all pass, the existing three included.

### Step 5: Manual check (if you can run the app)

`bun web` (with `bun run dev:worker`). Connect a provider that has watchlist
items. The watchlist row must show them without a pull-to-refresh.

**Verify**: describe the result, or say it was not possible.

## Test plan

- Two new cases (purge on silent clear; invalidate on connect, not on refresh).
- Existing disconnect cases still pass with the notifying mock.
- `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0
- [ ] `grep -n "SessionCacheSync" src/app/_layout.tsx` → import and element
- [ ] `grep -n "export function purgeProviderQueries\|export function syncQueryCacheWithSessions" src/state/session/index.ts` → 2 matches
- [ ] Only in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 006 hasn't landed (no `DIARY_QUERY_ROOT` purge in `disconnectProvider`).
- `onSessionChange` doesn't fire for same-process writes on web. If the web
  smoke in step 5 shows no reaction, report it rather than adding polling.
- A purge fires during a normal Trakt token refresh. This would show up as
  test 2 failing on its "refresh" half, or as Up Next skeletons after a refresh.

## Maintenance notes

- `known` is re-read from storage after every change, so a write from any code
  path (OAuth return, WebView connect, transport clear) is classified correctly.
- If a new merged cache is added, add it to `purgeProviderQueries`. One list
  now serves both the button and the silent clears.
- Reviewers: check the listener ignores non-`session.` keys (`clientId.*`,
  `tmdbToken` live in the same store).
