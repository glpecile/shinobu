# Two cast cards with the same React key on an episode page

## Symptom

(owner, 2026-09-12.) Opening *Ted Lasso* S4E7 logged
`Encountered two children with the same key, 'tmdb-person-3593833'` from
`features/person/people-section.tsx`'s cast rail. React's warning is not
cosmetic: sibling cards sharing a key may be duplicated or dropped.

## Cause

TMDB credits one person **once per character**, and a character respelled
between episodes is a second credit, not an edit:

```
3593833  Jude Mack  Katie Quinn          credit 6a7c80180b53735c73b06d8d
3593833  Jude Mack  Katie 'Boots' Quinn  credit 6a98813ad575fd8c4dfbc328
```

`normalizeCrewEntries` had always folded a person's several jobs into one
entry; `normalizeCastEntries` mapped the array straight through, so one person
became two cards keyed `tmdb-person-${id}`. The episode normalizer's own
guest-star dedupe only covered guests that repeated a *regular*, which is a
different duplicate.

## Fix

`normalizeCastEntries` (`lib/providers/tmdb/normalize.ts`) now folds by person
the way the crew path does: characters merge into the one card's role line and
the better billing (`order`) wins. Every TMDB cast surface — movie, series
aggregate credits, episode — routes through it, so it is one guard rather than
a key change per rail. It also made the regulars-vs-guests dedupe redundant: a
regular credited again as a guest now merges instead of losing the guest role.

## Rule

Anything keyed by a *person* out of a credits payload has to be folded by that
person first. A provider's credit list is one row per credit, and "one row per
human" is our contract, not theirs.
