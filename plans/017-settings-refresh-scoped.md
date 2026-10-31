# Plan 017: Settings pull-to-refresh refreshes the home feed, not the entire query cache

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- "src/app/(tabs)/settings.tsx" src/state/queries/use-unified-feed.ts`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it
> as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

Pulling to refresh on Settings calls `queryClient.invalidateQueries()` with no
filter. On native, every tab is mounted after launch
(`docs/solutions/native-tabs-mount-every-tab-at-launch.md`), so every **active**
query in every tab refetches at once:

- Up Next's per-show Trakt progress fan
- the AniList library (AniList allows ~30 requests a minute; see `docs/solutions/anilist-rate-limit-retry-storm.md`)
- every loaded diary page
- every Letterboxd film-watch and list read

It also marks the forever-cached identity mappings (ani.zip, TMDB→slug, Trakt
identity, AniList viewer) invalid, so they re-download on next use. The comment
says the intent is only "so the feed refetches on return". Home already has a
scoped refresh that does exactly that: `useRefetchUnifiedFeed`. Plan 0110
removed this same over-broad pattern from the details refresh.

## Current state

`src/app/(tabs)/settings.tsx` (~lines 37 and 54–62):

```tsx
  const queryClient = useQueryClient();
  ...
        <SettingsRail.Scroll
          ...
          // This screen has no server data of its own — the useful refresh is
          // marking every cached query stale so the feed refetches on return.
          onRefresh={() => queryClient.invalidateQueries()}
          tab="settings"
        >
```

`src/state/queries/use-unified-feed.ts`:

```ts
/**
 * Pull-to-refresh for the home feed: refreshes every section Home renders in
 * parallel and resolves once all settle. ...
 */
export function useRefetchUnifiedFeed() {
  const queryClient = useQueryClient();
  const connected = useConnectedProviders();
  function refetch() {
    return Promise.allSettled([ ...up next, watchlist, letterboxd lists, serializd lists/upcoming... ]);
  }
  return refetch;
}
```

Home uses it in `src/app/(tabs)/index.tsx:141` (`const refetchFeed = useRefetchUnifiedFeed();`).
Copy that import line exactly.

## Commands you will need

| Purpose   | Command                         | Expected on success |
|-----------|---------------------------------|---------------------|
| Install   | `bun install --frozen-lockfile` | exit 0              |
| Typecheck | `bun typecheck`                 | exit 0              |
| Lint      | `bun lint`                      | exit 0              |
| All tests | `bun run test`                  | all pass (never plain `bun test`) |

## Scope

**In scope**: `src/app/(tabs)/settings.tsx`.

**Out of scope**: `use-unified-feed.ts` (reuse as-is) and any other screen's refresh.

## Git workflow

- Branch: `perf/settings-refresh-scope`
- One commit: `perf(settings): refresh the home feed instead of every query`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Swap the handler

- Import `useRefetchUnifiedFeed` the way `src/app/(tabs)/index.tsx` does.
- `const refetchFeed = useRefetchUnifiedFeed();` in the component body.
- `onRefresh={refetchFeed}`.
- Replace the comment with: "No server data of its own. Pull refreshes the
  home feed the trackers above feed, the same scoped refresh Home uses, never
  the whole cache."
- If `queryClient`/`useQueryClient` is now unused in the file, remove it and its import.

**Verify**: `bun typecheck` → exit 0. `bun lint` → exit 0.
`grep -n "invalidateQueries()" "src/app/(tabs)/settings.tsx"` → no match.

### Step 2: Manual check (if you can run the app)

`bun web` (with `bun run dev:worker`). With at least one tracker connected,
open devtools → Network, pull to refresh on Settings (or trigger the refresh
control), and count requests. Expect only the home-feed reads, with no
ani.zip, TMDB `/find`, or diary page requests.

**Verify**: describe the request list, or say it wasn't possible.

## Test plan

- No new test. The repo doesn't test screen wiring, and `useRefetchUnifiedFeed` is Home's.
- `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck`, `bun lint`, `bun run test` exit 0
- [ ] No `invalidateQueries()` without a filter in `settings.tsx`
- [ ] Only `settings.tsx` changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- `SettingsRail.Scroll`'s `onRefresh` type doesn't accept a function returning
  `Promise<PromiseSettledResult[]>`. Wrap it as `() => refetchFeed()`. If the
  type demands `void`, report back rather than casting.

## Maintenance notes

- If Settings ever gains its own server data (e.g. a provider account panel), refresh that read too, explicitly.
- A repo-wide check for unfiltered `invalidateQueries()` is worth adding to
  lint later. Today `grep -rn "invalidateQueries()" src` should return nothing.
