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

**Note on caching:** these lookups are cached forever (`staleTime`/`gcTime`
Infinity) but only in memory — there is no query persister — so a bad cached
match does not survive an app restart. If a persister is ever added, cached
`['mapping', 'trakt-search', ...]` entries predating a matcher change must be
versioned or dropped.
