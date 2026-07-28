# Persisting the query cache: `Set` and `Map` payloads corrupt silently

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

## It happened again with `Map` (2026-07-28)

The note below said to add a tag *before* persisting anything exotic. `Map` was
persisted without one: `['mapping','anizip-episodes']` went on the allowlist with
the home-feed restore (#37), and `AniZipEpisodeMap` is a `ReadonlyMap`
(`lib/providers/mapping/anizip.ts`).

The failure is nastier than the `Set` one because the restored `{}` **passes the
guard written to catch it**:

```ts
if (map == null || map.size === 0) return null;   // undefined === 0 → false, falls through
const seasons = new Set([...map.values()]...);    // TypeError: undefined is not a function
```

Every cold-started anime details screen with an ani.zip mapping threw, taking the
seasons section's error boundary with it.

**Two-part fix, and the second part is easy to miss:** a codec only fixes what it
*writes*, so anyone with a corrupted snapshot already on disk keeps crashing.
`BUSTER` had to be bumped (v3 → v4) to discard them. Any future codec addition
needs the same pairing.

## Fix

A tagged round-trip in the persister's `serialize`/`deserialize`, rather than a
`superjson` dependency:

```ts
const SET_TAG = '@@set';
const MAP_TAG = '@@map';
JSON.stringify(client, (_k, v) =>
  v instanceof Set ? { [SET_TAG]: [...v] } : v instanceof Map ? { [MAP_TAG]: [...v] } : v);
JSON.parse(cached, (_k, v) =>
  isTaggedSet(v) ? new Set(v[SET_TAG]) : isTaggedMap(v) ? new Map(v[MAP_TAG]) : v);
```

Covered by `src/state/queries/persist.test.ts` (nested, empty, and a Map beside a
Set), including a regression asserting the exact `[...map.values()].map(...)` call
that threw.

**Prefer the codec to a defensive guard at the call site.** A null-guard would
turn a corrupted map into a silently *wrong* answer — no season title, no error —
and every future `Map` consumer would inherit the bug.

## Before adding a key to the persist allowlist

- **Is the payload plain JSON?** `Set`, `Map`, `Date`, and class instances all
  need codec support. `Set` and `Map` are handled today; `Date` and class
  instances are **not** — add the tag, a test, *and* a `BUSTER` bump before
  persisting anything else exotic. This checklist item already existed when
  `Map` was persisted without a codec, so treat it as load-bearing rather than
  advisory: check the payload's runtime type, not just its TypeScript shape.
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
