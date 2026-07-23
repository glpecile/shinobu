# `mock.module` leaks into other test files (and `mock.restore()` doesn't undo it)

**Added 2026-07-23.**

## Symptom

Adding `src/state/queries/up-next.test.ts` — which stubbed
`@/lib/providers/trakt/reads` so the slot's per-show fan could be counted —
broke two tests in a *different, untouched* file:

```
(fail) getWatchedShows pagination (2026 Trakt API change) > a single short page makes exactly one request
```

`bun test src/lib/providers/trakt/reads.test.ts` alone: green.
`bun test src/lib/providers/trakt/reads.test.ts src/state/queries/up-next.test.ts`: red.

## Cause

`bun:test`'s `mock.module` is **global and permanent for the process**: every
file in the run shares one module registry, so the stub replaced the real
module for `reads.test.ts` too — which imports `./reads` and asserts on the
real pagination loop. File order doesn't save you (the registry is consulted at
import time, and files run in one process), and `mock.restore()` in `afterAll`
does **not** roll a `mock.module` registration back.

`state/queries/serializd.test.ts` already documents the sibling hazard: whichever
mock loads first wins for every later importer.

## Fix

Mock modules only where the *module graph* can't load under bun at all
(`react-native-mmkv`, `react-native`, `@/lib/http/client`) — those are stubs of
things no test asserts on. For anything a test might legitimately exercise,
inject at a seam instead. Here the seam was already there: every provider read
in the Up Next slot goes through `queryClient.fetchQuery`, so a fake client that
answers by query key replaces the whole network layer, per test, with no global
state:

```ts
const fetchQuery = async ({ queryKey }) => {
  const [root, kind, id] = queryKey;
  if (root === 'trakt' && kind === 'watched-shows') return shows;
  if (root === 'trakt' && kind === 'show-progress') { requests.push(id); return progress; }
  …
};
await fetchUpNextInputs({ fetchQuery } as unknown as QueryClient, ['trakt']);
```

It also made the assertions better: the per-show request fan is observable
(the pool cap is asserted directly), and a single show's failure is simulated
by throwing for one id rather than by breaking a module for everyone.

## Rule of thumb

`mock.module` is a load-bearing global. If two suites could import the same
module, don't mock it — find the injection seam the code already has.
