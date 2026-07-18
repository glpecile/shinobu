# better-all result keys are in completion order, not input order

**Symptom:** After swapping `Promise.all` for `better-all`'s `all()` in
`fanOutLog`, two fan-out tests failed: `result.outcomes` came back in the order
tasks *settled* (fast adapters first), not the order of `targets`.

**Cause:** `all()`/`allSettled()` insert keys into their result object as each
task completes. `Object.values(result)` therefore reflects completion order —
even though the input object's string keys had a deliberate insertion order.

**Fix:** Never `Object.values()` a better-all result when order matters.
Rebuild the order from the source list:

```ts
const outcomesByProvider = await all(Object.fromEntries(...));
const outcomes = targets.map((provider) => outcomesByProvider[provider]);
```

Applies to `fanOutLog` (`LogMediaResult.outcomes` promises routing order) and
the reconcile records in `use-log-media.ts`. Callers that consume results by
key (feed refetch in `use-unified-feed.ts`, details refresh) are unaffected.
