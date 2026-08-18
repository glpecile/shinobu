# Diary scroll jank is row *mount* cost, not grouping cost

## Symptom

Scrolling the Diary over a large corpus (~1,300 logs across 5 trackers) stutters
badly. The obvious suspects — the merge/group pipeline, missing virtualizer size
hints — turned out to be the wrong ones, and fixing them changed nothing
visible.

## What the profiler actually said

React profiler, Pixel 9 Pro XL, dev build, one scroll gesture over the loaded
corpus:

```
7 React commits over 61s — one of them 332ms.
Commit #0 — 332.3ms, "Initial render: 30 components mounted"
  BasePressable            ×22 — 149.22ms self   ← 45% of the commit
  View                     ×168 — 54.68ms self   ← ~10 Views per row
  Text                     ×106 — 41.74ms self
  ExpoImage                ×52  —  9.34ms self   ← poster + 2 provider marks
```

Scrolling does **not** re-render `DiaryScreen`. The whole cost was Legend List
mounting a screenful of brand-new row fibers, and ~45% of that sat in the
gesture-handler + Reanimated pressable stack that every row rebuilt from
scratch.

Two things that looked like causes and were not:

- **`Intl.DateTimeFormat` per entry.** Real (it was constructed once per entry
  in `groupDiaryEntries` *and* once per day header in `flattenDays`) and worth
  caching — but grouping only runs on re-render, never during a drag.
- **Missing `estimatedItemSize`/`getItemType`.** Also real, also worth adding —
  but size hints only change how the virtualizer *estimates*, not what a row
  costs to build.
- **`[Native] objectKeys` at 245ms** in the CPU table was an artifact: the
  profiler reported `the sampler stalled for 316.6ms inside this window`, and
  that whole gap is attributed to whichever function ended it. Read the stall
  warning before chasing a native hotspot.

## Fix

**1. Turn on `recycleItems` for this one list.** `components/List` defaults it
to `false` app-wide because rows like `ActionableRow` hold hover state that
would leak into whichever row a cell recycled into. That default stays right;
the Diary is the measured exception — its rows are all prop-derived (the poster
resolves off the item id, day-collapse lives in MMKV, run-expansion lives in
`DiaryList`). The one residual is `ActionableRow`'s **web** hover flag, which
can briefly show a stale ⋯ on a recycled row until the next pointer move.

**2. Move per-cluster derivation out of the row.** Recycling trades mount cost
for recompute cost, and immediately exposed the next hotspot:

```
DiaryClusterRow — 44 renders, max 126.38ms for a single render
```

`DiaryClusterRow` called `summarizeCluster` (unions + sorts every entry's
episodes and providers) plus `formatEpisodeDetail` (sorts them again) in its
body. Un-recycled that ran once per cluster; recycled it runs every time the row
scrolls past a *different* run. It now happens once per cluster in
`flattenDays`, which already walks each cluster exactly once, and the row takes
a precomputed `ClusterView`.

**This is the general lesson:** recycling does not make work disappear, it
converts mounts into re-renders. Any derivation sitting in a recycled row's body
goes from once-per-item to once-per-scroll-past. Precompute it where the list is
flattened.

## Result

Same corpus, same gesture, same device — worst single React commit:

| | Worst commit | Hot commits (≥16ms) |
|---|---|---|
| Before | 332.3ms | 2 of 7 |
| + rail redesign + recycling | 132.2ms | 9 of 37 |
| + cluster precompute | **47.5ms** | 6 of 38 |

At 47.5ms the worst commit is Legend List's own container machinery
(`Container2`, `ContainerSlotBase`, `PositionViewState2`), not our components.
Dev renders run ~3× production, so treat the ratio as the finding and re-measure
on a release build before quoting absolute numbers.

## Still open

`useDiaryFeedQuery` re-runs `mergeDiaryEntries` + `groupDiaryEntries` on every
render: each provider slice is built with `(query.data?.pages ?? []).flat()`, so
the `states` array embeds query objects whose identity changes every render and
React Compiler cannot hold the memo below it. Costs ~20ms per `DiaryScreen`
render. It does **not** fire while dragging — only on page fetch and refresh —
which is why it was left out of this pass. Fixing it means rebuilding `states`
from stable primitives plus the already-memoized entry slices.

`collapseDay`'s bucket lookup is `buckets.find(…)`, i.e. O(n²) in a day's
entries. Harmless at four logs a day; the test corpus contains a **94-entry
day**. Not worth an index until the merge stops re-running, since today the two
compound.
