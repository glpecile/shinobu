# TMDB typo recovery needs candidate retrieval, not just local ranking

Observed with read-only `/search/multi` calls on 2026-10-14 (#255):

- `breakng bad` and `spirited awya` return no results, whereas `bad` and
  `spirited` return *Breaking Bad* and *Spirited Away* on page one.
- `interstelar` returns the distinct title *Interstelar* and *Interstellar
  Wars*, not *Interstellar*. The prefix `interst` retrieves *Interstellar*.
- `matrx` returns no results. `mat` is too broad: its first page has no
  *The Matrix*. `matr` does retrieve it.
- `star wras` finds a literal *Star Wras* record. `star` also retrieves
  *Star Wars*. Literal titles must remain ahead of spelling suggestions;
  the application cannot assume every unusual spelling is a typo.

`lib/providers/tmdb/fuzzy-search.ts` therefore ranks direct results, and when
there are fewer than five, requests at most two informative words or one
shortened single-word prefix. Supplemental results must match the complete
query within the edit budget, not just the word used to fetch them. Optional
request failures preserve direct results, and Effect interruption still
cancels in-flight requests through the HTTP layer.

Fuzzy comparisons end on word boundaries: `matrx` must not suggest
*Matrimony* just because its first five letters are one edit away. Prefix
shortening and edit budgets count Unicode code points, not UTF-16 code units;
splitting a supplementary-plane character (for example `𠮷`) makes
`encodeURIComponent` throw a defect that the typed-error fallback cannot catch.

## Limits and safety

This is first-page candidate search, not an offline copy of TMDB. A typo early
in a single word, every word misspelled, or an obscure candidate absent from
all fetched pages can still produce no suggestion. Broad queries with five or
more direct titles do not trigger more traffic. No spelling-variant request
fan-out, catalogue download, extra provider, proxy, or backend is introduced.

Only the search tab calls the fuzzy read. `searchTitles` and `searchMovie`
retain strict retrieval for identity lookups, including Letterboxd enrichment.
Keep the year/title guards described in
`trakt-text-search-wrong-movie-match.md`: a discovery suggestion is not evidence
that two provider records represent the same work.
