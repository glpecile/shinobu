# Diary reshuffles while providers land

## Symptom

On web the diary "flickers" and "re-renders" for the first half second after
the skeleton leaves: rows appear between rows already on screen, show titles
swap (English → romaji), day counts and provider dots change, rows move.
Frame-by-frame it is the list restructuring three or four times in ~400 ms.

## Cause

`useDiaryFeedQuery` runs one infinite query per provider and merges them in
render. The screen swapped the skeleton for the list as soon as *any*
provider had entries (`isLoading && entryCount === 0`). Simkl answers first,
then Trakt, then AniList, each ~100 ms apart, and every arrival re-runs
`mergeDiaryEntries` + `groupDiaryEntries`: the day re-sorts, cross-provider
collapse re-keys a row to the higher-priority contributor's id (so Legend
List remounts it), and the collapsed row takes that contributor's title.

Per-row enter fades, content-keyed wrappers, id pinning and text morphing were
all tried on this branch. Each animated the reshuffle instead of removing it,
and each added session-level state or a `useEffect` to the row path. A merged
feed cannot look calm while its inputs are still arriving.

## Fix

Hold the skeleton until every active provider's *first attempt* has settled
(data or error), then mount the list once with one enter fade on its root.
`isLoading` in the hook is now `query.isLoading && query.failureCount === 0`:
a provider already retrying (backoff runs seconds) no longer holds the
skeleton, it merges in later if it recovers, which is the one legitimate
late arrival.

After that first render nothing restructures on screen: pagination only
lowers the watermark, so new rows append below the fold, and rows above the
watermark already have every contributor loaded, so their ids and titles are
final. This is the Bluesky shape (one loading state per feed, merging done
before the UI sees it), kept on top of the per-provider queries the watermark
and partial-failure contract need.

## Not the fix

- Per-row mount animations: with `recycleItems` a row never mounts on
  scroll; without it every row mounts on scroll and plays the fade, which
  reads as the list re-rendering under the cursor.
- `MorphText` on titles: torph's root is `inline-block`, so inside
  `numberOfLines={1}` an overflowing title is hidden whole, not truncated.
