# "On your watchlist" hid the add for every provider still missing the item

**Found:** 2026-08-01, owner report. Repro: a film on both the Letterboxd and
Simkl watchlists, removed from Simkl only (details → "On your watchlist" →
deselect Letterboxd → confirm). Long-pressing that film's card afterwards
offered a settled, inert "On your watchlist" row and **no add affordance** —
survived an app restart with a fresh gather.

## It was not the gather

Three causes were suspected up front, and none of them was it:

1. **The Simkl leg errored, so `hasWatchlistReadLeg('simkl')` was false.** A
   plausible read of a session that had just spent a write plus several reads
   against Simkl's 10 GET/s + 1 POST/s budget. Not the cause — and the symptom
   is reproducible with every leg healthy.
2. **Stale `WatchlistEntry.sources` still listing `simkl`.** No: the report
   survives a restart with a cold, freshly-gathered cache.
3. **`incomplete` (Letterboxd's paginated scrape) leaking into the predicate.**
   No: it only ever *withholds* an add, and the add was withheld for Simkl,
   whose leg is not paginated.

`shouldOfferWatchlistAdd` was in fact returning **true** the whole time. It is
not what suppressed the row.

## The actual chain

`WatchlistMediaButton` derives its label from `isWatchlistCtaSettled(onList,
view)`, and `onList` is `useIsWatchlisted(item)` — a **whole-item** boolean over
the gathered rows: "is this film on *a* watchlist". The film was still on the
Letterboxd one, so:

1. `onList === true` → `settled === true`.
2. Settled renders the `copy.settled` label ("On your watchlist") and the
   `bookmark` icon.
3. In host mode (the card-actions sheet passes `onOpenPicker`) settled is also
   `disabled`. Self-hosted, a settled press opens the **remove** picker.

Either way, the add is unreachable. The row rendering at all is what made this
read as "`shouldOfferWatchlistAdd` returned false" — the gate that decides
*whether* the row exists and the rule that decides *what it claims* were two
different rules answering two different questions, and only one of them was
per-provider.

`shouldOfferWatchlistAdd`'s own docblock had already written down the correct
rule for this state — *"a film on the Letterboxd watchlist and not on Trakt's is
exactly where an add is most useful"* — it just never reached the label.

## The fix

One predicate answers both questions now.
`useWatchlistAddStillOffered(item)` (`features/watchlist-media/`) reads the same
gathered cache `useIsWatchlisted` reads, derives the item's per-provider
membership with the new pure `watchlistSourcesFor` (the same
`watchlistMergeKeys` recognition, so it cannot drift from the merge), and feeds
it straight into `shouldOfferWatchlistAdd`. `isWatchlistCtaSettled` takes the
result as a third input: **settled means "on every watchlist it can reach", not
"on one"**.

`watchlistSourcesFor` is `WatchlistEntry.sources` for a caller that has an item
but no merged row; `isWatchlistedIn` is now defined as `.length > 0` on it, so
there is still one recognition rule rather than two.

**R35 is preserved by direction, not by an extra check.**
`useWatchlistAddStillOffered` returns `false` on doubt — cold cache, errored
leg, partially-read leg — because `shouldOfferWatchlistAdd` requires
`hasWatchlistReadLeg` before counting a provider as missing. So suspected cause
(1), had it been real, would still produce the reported symptom: with the Simkl
leg errored the app has no evidence Simkl lacks the film, the CTA stays settled,
and the honest surface for that state is the removal picker's
unknown-membership row. Counting an errored leg as "missing" would be the app
asserting non-membership it cannot evidence — the exact claim R35 forbids on the
removal side, and no more defensible on the add side.

The consequence worth naming: a **partially-listed item now shows the add**, so
the self-hosted remove entry point (plan 0033 follow-up — a settled press opens
the remove picker) appears only once every applicable provider actually holds
the item. That is the right trade for a single button: an item on one tracker of
three has a whole add to offer and only a partial removal, and `/watchlist`
carries its own dedicated removal row regardless.

## The rule this generalizes to

Shinobu's providers are symmetric and independently connected, so **almost no
user-facing state about an item is one boolean**. "Watchlisted", "watched",
"logged" are all per-provider facts, and a whole-item roll-up of one is only
safe where the surface genuinely asks a whole-item question. When a CTA's job is
to act on providers, derive its state from the provider set — and where the set
is partly unknown, prefer the claim that asserts less.
