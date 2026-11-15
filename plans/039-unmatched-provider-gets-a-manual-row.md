# Plan 039: A connected provider with no match for an anime gets a manual row in the log sheet

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 04643c8..HEAD -- src/lib/providers/routing.ts src/lib/providers/routing.test.ts src/features/log-media/use-log-targets.ts src/features/log-media/log-confirm-sheet.tsx src/features/log-media/session/catch-up-log-sheet.tsx`
> Plan 035 removes the `nonSeasonOneEpisodes` option from `routing.ts` and its
> tests. Plan 033 changes the `useState(targets)` line in both sheets. Those
> diffs are expected. A change to `providersForWrite`, `splitWriteTargets`,
> `useLogTargetsSplit` or `LogFormFields`' props is a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/034-anime-takes-a-tmdb-id-of-its-own-kind.md and plans/038-one-episode-anime-filed-as-a-movie-logs-as-a-film.md (recommended: they reduce how often this row shows)
- **Category**: bug (no-dead-end rule)
- **Planned at**: commit `04643c8`, 2026-11-12

## Why this matters

An AniList anime reaches Trakt, Letterboxd and Serializd only when the log
enrichment finds a movie-side or TV-side id for it. When no id is found, those
providers are simply not in the sheet: no row, no reason, no link. In the
anime-lists dataset (2026-11-12), 2,516 AniList films and about 8,200 OVAs,
ONAs and specials have no TMDB id. A user with Letterboxd connected who logs
one of those films sees AniList and Simkl in "Write to" and nothing about
Letterboxd. `AGENTS.md` says: "Never a dead-end error. A write the platform
can't do, a failure, or a skip links to the item on that provider". A provider
that silently is not there is the same dead end.

After this plan, the log sheet shows one muted row for each such provider,
"Log manually on Letterboxd — No match found for this title", that opens the
provider. It uses the row component the sheet already has for manual targets.

**Owner note:** this adds a row for every unmatched provider on every
unmatched anime, including obscure specials that a tracker does not carry.
The owner accepted that when choosing this plan. If the row proves noisy, the
maintenance notes say where to narrow it.

## Current state

### Files

- `src/lib/providers/routing.ts` — all target routing. The new pure function
  goes here.
- `src/features/log-media/use-log-targets.ts` — `useLogTargetsSplit`, the
  hook the sheets read.
- `src/features/log-media/log-confirm-sheet.tsx` — `LogFormFields` (shared by
  both sheets) and `LogConfirmForm`.
- `src/features/log-media/session/catch-up-log-sheet.tsx` — the episode chain
  form, which also renders `LogFormFields`.
- `src/features/write-sheet/manual-write-rows.tsx` — `ManualWriteRows`. Read
  only.
- `src/lib/providers/routing.test.ts` — tests.

### Excerpts

`src/lib/providers/routing.ts` (top of the file):

```ts
type RoutableItem = Pick<NormalizedMediaItem, 'type' | 'isFilm' | 'externalIds' | 'tmdbTvVariant'>;

/** An id Trakt/Letterboxd's movie-TV world can resolve. */
function hasMovieTvIds(item: RoutableItem): boolean {
  const { trakt, tmdb, tvdb, imdb } = item.externalIds;
  return trakt != null || tmdb != null || tvdb != null || imdb != null;
}

export function animeEffectiveMovieTvType(item: Pick<NormalizedMediaItem, 'isFilm'>): 'MOVIE' | 'TV' {
  return item.isFilm === true ? 'MOVIE' : 'TV';
}

function effectiveTypes(item: RoutableItem): readonly MediaType[] {
  if (item.type === 'ANIME') {
    const movieTvType = animeEffectiveMovieTvType(item);
    return hasMovieTvIds(item) ? ['ANIME', movieTvType] : ['ANIME'];
  }
  ...
}
```

and, in the same file:

```ts
function writeSupport(provider: ProviderDescriptor, capability: WriteCapability): WriteSupport {
  if (capability === 'log') return provider.canWrite ? 'write' : 'none';
  return capability === 'watchlist' ? provider.watchlistWrite : provider.watchlistRemove;
}

export function providersForWrite(
  item: RoutableItem,
  connected: readonly ProviderId[],
  capability: WriteCapability,
): ProviderId[] {
  const types = effectiveTypes(item);
  return connected.filter((id) => {
    // A whole-entry Letterboxd TV log has no movie identity on other providers.
    if (item.tmdbTvVariant != null && id !== Provider.Letterboxd) return false;
    const provider = PROVIDERS[id];
    return (
      writeSupport(provider, capability) !== 'none' &&
      types.some((type) => provider.mediaTypes.includes(type))
    );
  });
}
```

Which media types each provider declares (`src/lib/providers/registry.ts`):
Trakt handles `MOVIE` and `TV`. Letterboxd handles `MOVIE`. Serializd handles
`TV`. AniList handles `ANIME` and `MANGA`. Simkl handles `MOVIE`, `TV` and
`ANIME`. So an anime with no movie/TV ids still routes to AniList and Simkl,
and misses Trakt, Letterboxd and Serializd. Open `registry.ts` and confirm
this before you write the tests.

`src/features/log-media/use-log-targets.ts` (whole hook):

```ts
interface LogTargetsSplit {
  writable: ProviderId[];
  manual: ProviderId[];
}
...
export function useLogTargetsSplit(item: NormalizedMediaItem): LogTargetsSplit {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();
  const platform = currentPlatform();
  const letterboxdUserscript = useLetterboxdUserscript();

  const { data } = useQuery({
    queryKey: ['log-targets', item.id, item.tmdbTvVariant ?? null, ...connected, platform, letterboxdUserscript],
    queryFn: async () =>
      splitWriteTargets(
        await enrichExternalIds(queryClient, item, connected),
        connected,
        platform,
        'log',
        letterboxdUserscript,
      ),
  });

  return data ?? splitWriteTargets(item, connected, platform, 'log', letterboxdUserscript);
}
```

The `data ?? …` fallback is the split **before** the id lookup finishes. At
that moment almost every AniList anime looks unmatched. The new list must
therefore come only from `data`, never from the fallback.

`src/features/log-media/log-confirm-sheet.tsx`, inside `LogFormFields`:

```tsx
        {/* On web, Letterboxd is manual only while the script can't log. */}
        <ManualWriteRows
          item={item}
          manual={manualTargets}
          reasons={process.env.EXPO_OS === 'web' ? { [Provider.Letterboxd]: letterboxdScriptHint(scriptUntrusted, 'log here') } : undefined}
        />
```

`LogFormFields` receives `manualTargets = []` as a prop
(`manualTargets?: readonly ProviderId[]` in `LogFormFieldsProps`). Both sheets
pass it from `const { writable: targets, manual: manualTargets } =
useLogTargetsSplit(item);`.

`ManualWriteRows` (`src/features/write-sheet/manual-write-rows.tsx`) takes
`manual`, `item`, an optional `verb` (default `'Log manually on'`) and
optional `reasons: Partial<Record<ProviderId, string>>`. Each row links to
`providerItemUrl(provider, item) ?? providerHomeUrl(provider)`, so a row
always has a link. It renders nothing for an empty list.

### Conventions that apply

- "All routing lives in `src/lib/providers/routing.ts`. Never branch on type
  or provider at a call site." The rule for "unmatched" is a routing function.
- Routing functions are pure: no network, no `Platform.OS`.
- Reuse `ManualWriteRows`. Do not build a new row, and do not add a search
  URL builder; the existing link contract (item URL, else the provider's home
  page) is the one to use.
- `className` is composed with `cn()`; this plan adds no classes.
- Tests: `routing.test.ts` uses an `ids({...})` helper to build
  `externalIds` and string provider ids. One case per branch.
- No `useEffect`, no `useMemo`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Typecheck | `bun typecheck` | exit 0, no errors |
| Lint | `bun lint` | exit 0 |
| Focused tests | `bun test --isolate src/lib/providers/routing.test.ts` | all pass |
| Full tests | `bun run test` | all pass |

## Scope

**In scope** (the only files you should modify):
- `src/lib/providers/routing.ts` (add one exported function)
- `src/lib/providers/routing.test.ts`
- `src/features/log-media/use-log-targets.ts`
- `src/features/log-media/log-confirm-sheet.tsx`
- `src/features/log-media/session/catch-up-log-sheet.tsx`
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `providersForWrite`, `splitWriteTargets`, `resolveWriteTargets`. Unmatched
  providers are **not** write targets and must never reach the fan-out.
- `use-log-media.ts`. The mutation and its outcomes do not change.
- `ManualWriteRows`, `manualRowsFor`, `external-urls.ts`.
- The watchlist sheets and `use-watchlist-media.ts`.
- `log-media-button.tsx`, `episode-log-button.tsx`, `seasons-section.tsx`,
  `anime-seasons-section.tsx`. They read `writable` and `manual` only.
- The opposite case (a TMDB movie or show with no AniList match). A western
  animated film would show "no match on AniList" every time; that row is not
  wanted.

## Git workflow

- Branch: `fix/log-unmatched-provider-row`
- One commit: `fix(log): show a manual row for a provider with no match for an anime`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: The routing function

In `src/lib/providers/routing.ts`, below `providersForWrite`, add:

```ts
/**
 * Connected providers that take this anime's movie or TV side but that no id
 * reaches, so `providersForWrite` leaves them out. The log sheet lists them
 * as manual rows; they are never write targets. Call it on the enriched item.
 */
export function unmatchedWriteTargets(
  item: RoutableItem,
  connected: readonly ProviderId[],
  capability: WriteCapability,
): ProviderId[] {
  if (item.type !== 'ANIME' || item.tmdbTvVariant != null || hasMovieTvIds(item)) return [];
  const type = animeEffectiveMovieTvType(item);
  return connected.filter((id) => {
    const provider = PROVIDERS[id];
    return (
      writeSupport(provider, capability) !== 'none' &&
      provider.mediaTypes.includes(type) &&
      !provider.mediaTypes.includes('ANIME')
    );
  });
}
```

**Verify**: `bun typecheck && bun lint` → both exit 0.

### Step 2: Tests for it

In `src/lib/providers/routing.test.ts`, import `unmatchedWriteTargets` and add
one `describe` with three cases. Use the file's `ids()` helper as the
neighbouring tests do:

```ts
describe('unmatchedWriteTargets', () => {
  const all = ['trakt', 'anilist', 'letterboxd', 'serializd', 'simkl'] as const;

  it('lists the movie trackers for an anime film no id reaches', () => {
    expect(unmatchedWriteTargets({ type: 'ANIME', isFilm: true, ...ids({ anilist: 1 }) }, all, 'log'))
      .toEqual(['trakt', 'letterboxd']);
  });

  it('lists the TV trackers for an anime series no id reaches', () => {
    expect(unmatchedWriteTargets({ type: 'ANIME', ...ids({ anilist: 1 }) }, all, 'log'))
      .toEqual(['trakt', 'serializd']);
  });

  it('is empty once a movie or TV id is known', () => {
    expect(unmatchedWriteTargets({ type: 'ANIME', isFilm: true, ...ids({ anilist: 1, tmdb: 2 }) }, all, 'log'))
      .toEqual([]);
  });
});
```

If `ids()` in that file has a different shape than `...ids({...})` spread
into the item, copy how the nearest existing `resolveWriteTargets` test builds
its item.

**Verify**: `bun test --isolate src/lib/providers/routing.test.ts` → all pass, three new cases included.

### Step 3: The hook returns the list

In `src/features/log-media/use-log-targets.ts`:

1. Add `unmatched: ProviderId[];` to `LogTargetsSplit`, with the comment
   `/** Connected providers no id reaches for this anime. Empty until the id lookup has answered. */`.
2. Import `unmatchedWriteTargets` next to `splitWriteTargets`.
3. Change the `queryFn` to compute both from the same enriched item:

   ```ts
       queryFn: async () => {
         const enriched = await enrichExternalIds(queryClient, item, connected);
         return {
           ...splitWriteTargets(enriched, connected, platform, 'log', letterboxdUserscript),
           unmatched: unmatchedWriteTargets(enriched, connected, 'log'),
         };
       },
   ```

4. Change the return to keep the fallback free of unmatched rows:

   ```ts
     return data ?? { ...splitWriteTargets(item, connected, platform, 'log', letterboxdUserscript), unmatched: [] };
   ```

5. In the hook's docblock, add one sentence: unmatched providers come only
   from the enriched answer, because before it every anime looks unmatched.

**Verify**: `bun typecheck` → exit 0. (Existing callers destructure
`writable` and `manual` only, so they compile unchanged.)

### Step 4: The sheets render the rows

In `src/features/log-media/log-confirm-sheet.tsx`:

1. Add to `LogFormFieldsProps`, next to `manualTargets`:

   ```ts
   /** Connected providers with no match for this item — a manual row with the reason, never a toggle. */
   unmatchedTargets?: readonly ProviderId[];
   ```

2. In `LogFormFields`, destructure `unmatchedTargets = []` and render, directly
   after the existing `<ManualWriteRows … manual={manualTargets} … />`:

   ```tsx
           <ManualWriteRows
             item={item}
             manual={unmatchedTargets}
             reasons={Object.fromEntries(unmatchedTargets.map((id) => [id, 'No match found for this title']))}
           />
   ```

3. In `LogConfirmForm`, read the new field and pass it:
   `const { writable: targets, manual: manualTargets, unmatched: unmatchedTargets } = useLogTargetsSplit(item);`
   and add `unmatchedTargets={unmatchedTargets}` to its `<LogFormFields … />`.

In `src/features/log-media/session/catch-up-log-sheet.tsx`, do the same in
the component that calls `useLogTargetsSplit` and renders `<LogFormFields>`.

**Verify**: `bun typecheck && bun lint` → both exit 0.

### Step 5: Full gates

**Verify**: `bun run test` → all pass.

### Step 6 (optional evidence): See it on a device

Only if a simulator with signed-in AniList and Letterboxd accounts is
available. Otherwise skip and say so in your report. Do not confirm a write.

1. Open the log sheet for an AniList film that has no TMDB entry.
2. Expected: under "Write to", a muted row "Log manually on Letterboxd" with
   the line "No match found for this title". Pressing it opens Letterboxd.
3. Open the log sheet for a well-known anime film (one that maps).
   Expected: no such row; Letterboxd is a normal checked target.

## Test plan

- Three new cases in `src/lib/providers/routing.test.ts` (step 2).
- No component test: the repo does not test these sheets, and the hook change
  is a pass-through.
- Verification: `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0; the three `unmatchedWriteTargets` cases pass
- [ ] `grep -rn "unmatchedWriteTargets" src --include="*.ts" --include="*.tsx" | grep -v "\.test\." | wc -l` is 3 (definition, import, call)
- [ ] `grep -n "unmatched" src/features/log-media/use-log-media.ts` returns no matches (the mutation never sees them)
- [ ] `grep -c "unmatchedTargets" src/features/log-media/log-confirm-sheet.tsx` is 5 or more
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- `registry.ts` declares media types that differ from the list in "Current
  state" (the expected arrays in step 2 would be wrong).
- Lint rejects the `ManualWriteRows` usage or reports a React Compiler bailout
  on a sheet component.
- A caller of `useLogTargetsSplit` fails to compile.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- This change hot reloads. No native rebuild.
- The row appears only after the id lookup has answered, so it can pop in a
  moment after the sheet opens. `ManualWriteRows` renders nothing for an empty
  list, so the layout grows by one bordered box. If that shift is a problem,
  see `docs/solutions/reserve-the-row-a-late-control-will-need.md` before
  changing it.
- To narrow the row if it is noisy: filter in `unmatchedWriteTargets` (for
  example films only, or Letterboxd only). Do not filter in the sheet.
- A provider that **is** routed but then fails for a missing id (Letterboxd
  with an IMDb id and no TMDB id or slug; Serializd with no TMDB id) is not
  covered here. Those report an error or a reasoned skip after the write.
- The link is the provider's home page when no item URL can be built. A
  title search link per provider was left out on purpose (the repo's person
  and studio links use "id or nothing"); it is an owner decision.
- A reviewer should check that `unmatched` never reaches `providers:` in a
  `logMedia.mutateAsync` call.
