# Plan 028 (investigate): Measure the persisted query snapshot on web and decide whether it needs a bound

> **Executor instructions**: This is an **investigation** plan. You change no
> production code. You measure, then write a short findings note. Follow the
> steps and run every verification. If anything in "STOP conditions" occurs,
> stop and report. When done, update this plan's row in `plans/README.md`
> to DONE (with the verdict) unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- src/state/queries/persist.ts src/state/queries/persist-provider.tsx`
> If either changed, re-read the allowlist before measuring.

## Status

- **Priority**: P3
- **Effort**: S (measurement) → the follow-up fix is M if needed
- **Risk**: LOW (no code change)
- **Depends on**: none
- **Category**: perf (investigate)
- **Confidence**: MED that the growth exists; LOW that it hits the quota in practice. Hence measure first.
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

The TanStack Query cache is persisted to MMKV (on web: `localStorage`, about
5 MB per origin) as **one** JSON string, so cold starts paint instantly. The
allowlist comment says unbounded per-item families are excluded because web
storage is small. But several per-item prefixes *are* persisted and grow with
browsing: Letterboxd slug, film and film-watch entries (one per film seen on
any list or filmography), per-show Trakt progress, and ani.zip mappings. All
are kept for 24 h. If the string ever exceeds the quota, `setItem` throws, the
persister silently stops saving, and the last good snapshot ages out. The
"instant home" cold start then regresses without any signal. On native, every
save re-serializes the whole growing blob. Whether this happens for real
accounts is unknown, so this plan measures it.

## Current state

`src/state/queries/persist.ts`:

- `PERSIST_KEY = 'shinobu.query-cache'`, `STORAGE_ID = 'query-cache'`, `MAX_AGE_MS = 24h`.
- `PERSISTED_PREFIXES` includes, among others:
  `letterboxdQueryKeys.slug(0).slice(0, -1)`, `letterboxdQueryKeys.film('').slice(0, -1)`,
  `letterboxdQueryKeys.filmWatchesRoot()`, `traktQueryKeys.showProgress(0).slice(0, -1)`,
  `['mapping','anizip']`, `['mapping','anizip-episodes']`. The diary is excluded on web.
- `createQueryPersister()` uses `createSyncStoragePersister` with no `retry` option,
  and its `setItem` writes straight to MMKV.

On web, react-native-mmkv's fallback stores keys in `localStorage`. The exact
key prefix depends on the MMKV instance id. In the browser console,
`Object.keys(localStorage)` shows it.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Run web | `bun web` + `bun run dev:worker` | app at the printed URL |
| Size (browser console) | `Object.entries(localStorage).map(([k,v]) => [k, (k.length+v.length)*2]).sort((a,b)=>b[1]-a[1]).slice(0,5)` | bytes per key (UTF-16) |

## Scope

**In scope**: create `docs/brainstorms/<YYYY-MM-DD>-persisted-snapshot-size.md` (today's date, the folder's naming) with your
measurements and verdict (follow the tone of existing files in `docs/brainstorms/`).

**Out of scope**: any change to `persist.ts`. If a fix is warranted, the verdict
section describes it, and the owner or advisor turns it into a plan.

## Steps

### Step 1: Baseline

With at least two trackers connected (ideally Letterboxd plus Trakt or Simkl),
open the web app fresh, let Home settle, and record the snapshot key's size
using the console snippet.

**Verify**: one number (bytes) recorded.

### Step 2: Heavy browsing

Open five large Letterboxd lists (100+ films each), scroll each to the end,
open two filmographies, then return Home and wait ~5 s for the persister.
Record the size again, and compute the size per film browsed.

**Verify**: a second number and the per-film estimate.

### Step 3: Verdict

In the brainstorm note, include both numbers, the per-film growth, and an
extrapolation to the 5 MB quota (minus the other `localStorage` keys). The verdict:

- **< 30 % of quota after heavy browsing**: "no action". Add it to
  `plans/README.md`'s rejected list with the numbers.
- **≥ 30 %**: recommend one of: (a) exclude the per-film Letterboxd prefixes
  on web, as the diary already is; or (b) add `retry: removeOldestQuery` (from
  `@tanstack/query-sync-storage-persister`) so a full quota drops the oldest
  entries instead of failing silently. Note what each costs (a: first-paint
  skeletons on list rows after a cold start on web).

**Verify**: the note exists and states one verdict.

## Done criteria

- [ ] `docs/brainstorms/<YYYY-MM-DD>-persisted-snapshot-size.md` (today's date, the folder's naming) exists with measurements and a verdict
- [ ] No production file changed
- [ ] `plans/README.md` row updated with the verdict

## STOP conditions

- You can't connect real tracker accounts. Report that, because measuring an
  empty account is meaningless.

## Maintenance notes

- Re-measure whenever a new per-item prefix joins `PERSISTED_PREFIXES`.
