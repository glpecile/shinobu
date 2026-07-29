# AniList `MediaList.customLists` is an untyped `Json` map of *every* list

**Found:** 2026-07-29, building the watchlist removal guard (plan 0031 U16 / R36).

## The trap

`DeleteMediaListEntry` destroys the whole list entry, not just its PLANNING
status — so the removal only fires against a **bare** PLANNING entry, and one of
the things that makes an entry non-bare is membership in a user's custom list.

The obvious read is `mediaListEntry { customLists }` and then "does it have any
keys?" That is wrong, and wrong in the direction that breaks the feature
silently: `customLists` is declared `Json` in AniList's schema (no shape, no
list type), and what it returns for **every** entry is an object with one key
per custom list the *viewer* has ever defined, with the membership boolean in
the value:

```json
{ "Rewatching": false, "Favourites": false, "Comfort shows": false }
```

So keying on key-presence refuses every removal for any viewer who has ever made
a single custom list — which is a large share of AniList users, and the refusal
copy would blame a custom list the anime is not on.

## The fix

Read the values, not the keys. `readCustomLists` in
`src/lib/providers/anilist/reads.ts` narrows the untyped `Json` to the list
names whose value is truthy; `refusalClause` in `writes.ts` then refuses only on
`customLists.length > 0`.

Because the field is `Json`, TypeScript gives no help here — the narrowing is
hand-written and defensive (non-object, null, and non-boolean values all fall
through to "not a member"), which is the safe direction: a mis-parsed value
under-reports membership at worst, and every other guard clause
(status/progress/repeat/score/notes/startedAt) still has to pass before a delete
is issued.

## Related

- The guard is a **fresh in-effect read**, never the cache (plan 0031 KTD-2) —
  a stale entry is exactly how a scored, half-watched entry would get deleted.
- `docs/solutions/anilist-rate-limit-retry-storm.md` — why that fresh read is
  one request on the removal path and not a background poll.
