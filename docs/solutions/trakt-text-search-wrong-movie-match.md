# Trakt title search resolves to the wrong film without a year gate

**Symptom (2026-07-17):** the details page for Nolan's *The Odyssey* (2026,
Letterboxd watchlist item) rendered Kubrick's *2001: A Space Odyssey*
metadata — 149 min runtime, the monolith overview, Keir Dullea in the cast.

**Cause:** cross-provider identity/metadata enrichment resolves
slug-title-year-only items (Letterboxd) through Trakt text search
(`/search/movie?query=<title>`). The original picker preferred an exact-year
match but **fell back to the top result** when no year matched. Trakt ranks
by popularity, so any upcoming/obscure film sharing a title with a classic
resolves to the classic: *The Odyssey* (2026) → *2001: A Space Odyssey*.
An unreleased film can also rank below `limit=5` entirely, guaranteeing the
fallback fires. This poisoned both the details-screen metadata merge **and
the log fan-out** — a "mark as watched" could have written the wrong film to
Trakt.

**Fix:** `src/lib/providers/pick-movie-match.ts` — exact-year match first,
then ±1 year (festival premiere vs wide release straddles year boundaries
between Letterboxd and Trakt), and otherwise **no match**: when the year is
known, wrong-film data is strictly worse than none. Only yearless items may
take the top hit. Search `limit` raised 5 → 10 so the year gate actually
sees low-ranked upcoming films.

## Extension (2026-07-25): year gate wasn't enough — plan 0024 U5

**Symptom:** *Labyrinth* (2025) rendered Jim Henson's *Labyrinth* (1986);
*Motor City* (2025) rendered an unrelated older film. Both arrived with a
correct year from their origin provider, so the year gate above *should* have
caught them.

**Two causes, both upstream of the gate:**

1. **Recall.** TMDB `/search/movie` ranks by popularity and the gate only sees
   page 1. A brand-new film sharing its title with a classic can be absent
   from the candidate list entirely — the gate then correctly returns `null`,
   but the item silently loses its metadata, and on the Trakt leg the
   near-year rows that *were* returned could still win.
2. **Tolerance abused as a fallback.** With no exact-year candidate, the ±1
   window took the first in-window film without asking whether anything else
   was equally close. Two same-title films either side of the target year
   (2024 and 2026 for a 2025 item) is a coin flip, not a match.

**Fix:**

- `pickMovieMatch` takes an optional `title` and ranks in tiers — exact year
  (exact title beating a substring title inside that tier), then a ±1 window
  that yields a result **only when exactly one plausible candidate sits in
  it**, else `null`. Title comparison is case- and diacritic-insensitive with
  punctuation collapsed (`titleKey`).
- `searchMovie` (TMDB) accepts `year` and sends `primary_release_year` — a
  recall fix so the true film is on page 1 at all.
- Because `primary_release_year` filters *exactly*, it would have deleted the
  ±1 tolerance. `state/queries/mapping.ts`'s `searchTmdbMovieId` therefore
  retries **unfiltered** when the constrained search yields no confident match,
  and re-runs the same gate. The second request only fires on a miss.

Both `null` consumers were re-confirmed to skip the merge rather than degrade
to `movies[0]`: `movieSearchQuery` (result feeds `mergeCatalogueMetadata`) and
`resolveTmdbId` in `state/queries/media-details.ts` (`null` → `undefined` →
provider-only details). That's the KTD2 invariant — a wrong candidate's
`externalIds.tmdb/trakt` is what poisons every downstream query, so the guard
belongs at the match layer, not the merge.

**Note on caching:** these lookups are cached forever (`staleTime`/`gcTime`
Infinity) but only in memory — there is no query persister — so a bad cached
match does not survive an app restart. If a persister is ever added, cached
`['mapping', 'trakt-search', ...]` entries predating a matcher change must be
versioned or dropped.
