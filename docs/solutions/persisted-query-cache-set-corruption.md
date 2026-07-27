# Persisting the query cache: `Set` payloads corrupt silently

**Context:** the query cache is persisted to MMKV (`src/state/queries/persist.ts`)
so the home screen restores from disk instead of waiting out Up Next's ~6-deep
request waterfall on every cold start.

## The trap

`createSyncStoragePersister` defaults to `JSON.stringify` / `JSON.parse`.
`JSON.stringify(new Set(['a']))` is `{}` — no error, no warning. Trakt's
`show-progress` read normalizes to `{ watchedKeys: Set<string> }`
(`lib/providers/trakt/normalize.ts`), so with the default codec every restored
progress entry comes back as `{ watchedKeys: {} }`. Nothing fails at restore
time; the first `watchedKeys.has(...)` on a cold-started details screen throws
`is not a function`, one navigation later and with no obvious link to
persistence.

## Fix

A tagged round-trip in the persister's `serialize`/`deserialize`, rather than a
`superjson` dependency:

```ts
const SET_TAG = '@@set';
JSON.stringify(client, (_k, v) => (v instanceof Set ? { [SET_TAG]: [...v] } : v));
JSON.parse(cached, (_k, v) => (isTaggedSet(v) ? new Set(v[SET_TAG]) : v));
```

Covered by `src/state/queries/persist.test.ts` (nested and empty Sets included).

## Before adding a key to the persist allowlist

- **Is the payload plain JSON?** `Set`, `Map`, `Date`, and class instances all
  need codec support. Only `Set` is handled today — add the tag, and a test,
  before persisting anything else exotic.
- **Is it bounded?** MMKV's web fallback is `localStorage` (a few MB). Search
  results, per-item details and TMDB credits are deliberately excluded.
- **Can it outlive a disconnect?** Every provider read lives under a
  `[providerId]` root that `useDisconnectProvider` purges. `['up-next','inputs']`
  is the exception — it merges both providers under one key, so it needs its own
  `removeQueries` (see `state/queries/up-next-cache.ts`). Persistence turns a
  60-second staleness bug into a 24-hour on-disk one.

## Related gotchas

- **`gcTime` must be ≥ the persister's `maxAge`.** Only queries still in the
  cache get dehydrated, so the 5-minute default would let home-feed entries be
  collected mid-session and written out of the snapshot. Both are 24 h.
- **MMKV on the server.** `createMMKV` is lazy and guarded by
  `typeof window === 'undefined'` — Expo Router prerenders every route, and
  `localStorage` doesn't exist there
  (`docs/solutions/expo-web-ssr-mmkv-storage-on-server.md`).
- **`mock.module` is global for a whole `bun test` run.** Two log-media suites
  partially stub `@/state/queries/mapping`, so importing `mappingQueryKeys` into
  `persist.ts` broke them from an unrelated file. Its two prefixes are literals
  for that reason.
