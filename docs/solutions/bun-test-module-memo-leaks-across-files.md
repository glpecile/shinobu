# A faked `window` in one test file hands a TMDB token to every later one

**Added 2026-07-27.**

## Symptom

Plan 0030 U8 needed `fetchUpNextInputs` to prove the Letterboxd release source
settles under its own provider id. Reaching that resolve requires a username
*and* a TMDB token, so a new suite in `src/state/queries/up-next.test.ts` did
what `letterboxd.test.ts` already does — `setStoredTmdbToken(…)` plus
`globalThis.window = {}`, cleaned up in `afterAll`.

The new suite passed. A test in a **different, untouched** file failed:

```
(fail) fetchLetterboxdReleaseInputs — without a TMDB token > contributes nothing and spends no request
- []
+ [["letterboxd", "watchlist", "cinephile"]]
```

`bun test src/state/queries/letterboxd.test.ts` alone: green.
`bun test`: red.

## Cause

Not `mock.module` this time (that hazard is
`bun-mock-module-leaks-across-suites.md`) — **app-code module state**.
`state/session/tmdb-token.ts` memoizes the resolved token in a module-level
`cachedToken`, and only fills it when `isServer()` is false:

```ts
function readToken(): string {
  if (cachedToken == null && !isServer()) {
    cachedToken = resolveTmdbToken({ builder: builderTmdbToken(), stored: getStoredTmdbToken() });
  }
  return cachedToken ?? '';
}
```

bun runs every test file in **one process with one module registry**, so
`tmdb-token.ts` is instantiated once for the whole run. The moment any file
fakes a `window` in and calls `tmdbToken()`, `cachedToken` is populated —
permanently. `delete globalThis.window` in `afterAll` puts the *gate* back but
cannot clear the memo, and there is no reset path (the invalidation listener is
registered by `useSyncExternalStore`, which never runs under bun).

So a file whose whole point is "no token configured" reads a token, and file
ordering decides whether the suite is green.

## Fix

Only **one** test file in the run may fake a `window` for the token, and it must
be the file that already owns both states — `state/queries/letterboxd.test.ts`,
whose no-token suite is deliberately declared *before* the token is set. The
`fetchUpNextInputs` assertion moved there rather than duplicating the dance:

```ts
// in letterboxd.test.ts, inside the describe that already set the token
const { fetchUpNextInputs } = await import('./up-next');
const inputs = await fetchUpNextInputs(client, ['letterboxd']);
expect(inputs.errors).toEqual([{ provider: 'letterboxd', message: 'watchlist 429' }]);
```

`up-next.test.ts` carries a comment saying why its Letterboxd case lives
elsewhere, so the dance doesn't get re-added.

## Rule of thumb

`mock.module` is not the only process-wide global in a bun run — **any
module-level cache in app code is one too**. Before a test writes to shared
runtime state (a faked `window`, an MMKV session, a lazily-memoized token), ask
which module memoizes it and whether an `afterAll` can actually undo it. When it
can't, the assertion belongs in the file that already owns that state.
