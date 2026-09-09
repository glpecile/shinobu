# Diary rows flicker when a second provider's page merges in

## Symptom

On web, once diary rows animate in (`lib/page-transition`'s blur-fade on each
row), a row the user is already looking at blinks — fades from transparent —
the moment a second provider's diary page lands. It looks like "the show name
updated and flickered". Expanded episode runs also collapse at that moment.

## Cause

`merge.ts`'s `toMerged` gives a merged row the id of its **primary**
contributor (`PROVIDER_PRIORITY`: Trakt over Simkl over Serializd over
AniList). Providers fetch in parallel, so a Simkl-only row gets re-keyed to
the Trakt log id when Trakt's page arrives later. To Legend List that is a
different item: the old row unmounts, the new one mounts and plays its enter
fade over the same pixels. The run-expansion set is keyed on the same id, so
that state is lost too.

A first attempt keyed each row's wrapper on a content signature (providers +
episodes) so *changed* rows would replay the fade. That is the same flicker on
purpose: a visible row restarting from opacity 0 reads as a blink, not a
transition.

## Fix

Row identity must not depend on which providers have answered yet.
`merge.ts`'s `pinRowIds` pins a row to the first id it rendered under, aliased
by every join key the merge would have matched it on (each namespaced external
id, scoped to the episode set, plus the day). A later merge sharing any alias
keeps the id, so the row keeps its DOM and its content updates in place:

- the detail line, day count and run pill go through `MorphText` (torph);
- a newly merged provider's dot mounts with the enter fade;
- the poster fades over the placeholder via expo-image `transition`.

Only rows that genuinely arrive mount, and only they fade in.

**The alias lookup must stay one-to-one.** A first cut handed the pinned id to
*every* row matching an alias, and Legend List threw `Detected overlapping key
(simkl-…-s1e9)`: the merge deliberately keeps same-provider logs of one
episode apart (a same-day rewatch is two rows, AE6), so two Trakt rows shared
every alias with one Simkl row and got the same key — and duplicate keys make
Legend List drop and re-create containers, which *is* a flicker. `pinRowIds`
therefore claims an alias once per pass (first-come; the rest keep their own
log id), never re-points a registered alias, and never lets a pinned id shadow
another row's actual log id. `merge.test.ts` covers both the keep-id and the
never-duplicate cases.

**Only rows new to the diary fade.** With recycling off, a row mounts every
time it scrolls into view, and fading each of those reads as the whole list
re-rendering under the cursor (the "re-render galore" recording). `RowEnter`
plays the fade only for keys absent from every earlier data pass this
session (`markEnteringRows`), decided once at mount and retired after it, so
scrolling, re-expanding a day, or returning to the tab moves nothing.

Two things had to change with it:

- **`recycleItems` is native-only.** A recycled container swaps items on
  scroll, which would morph one show's title into another's and would never
  mount (so never fade in) a row that actually arrived. The recycling win was
  measured on native's gesture-handler stack
  (`diary-scroll-jank-is-row-mount-cost.md`), not on web.
- **Titles stay plain `Text`.** Torph's root is `inline-block`; inside a
  `numberOfLines={1}` container an overflowing atomic inline is hidden whole
  rather than truncated, so a long title would vanish. With stable ids a title
  change is a plain in-place swap, which does not flicker.
