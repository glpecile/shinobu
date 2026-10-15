# Fuzzy title search — #255

## Scope

- Improve the search tab's TMDB movie/TV section, without a backend, catalogue
  download, new dependency, or native changes. AniList, people, studios, and
  automatic title/year identity resolution retain their current contracts.
- Keep the existing debounce, cancellation, TanStack cache, result rows, and
  details navigation. Search suggestions never change a title's provider IDs.

## Implementation

1. Add a search-tab-only provider read. Fetch the original TMDB query first,
   then rank by case/diacritic/punctuation-insensitive title similarity, including
   the original-language title. Exact titles precede prefixes, substrings, and
   bounded edit-distance matches (including adjacent transpositions). Preserve
   TMDB order on ties and retain direct results even if they match an alias that
   TMDB does not return in the payload.
2. When fewer than five direct titles are returned, try at most two distinct
   informative words from a multiword query. A single word of at least five
   characters gets one shortened-prefix query instead. Search only the first
   page of each query, discard unrelated supplemental candidates, and deduplicate
   by movie/TV identity. Fallback failures must not erase successful direct
   results; primary request errors still reach the existing error UI.
3. Bound fuzzy work to 120 normalized query characters. Short queries keep
   literal matching only. Do not enumerate spelling variants or page through the
   entire TMDB catalogue. This is candidate-based typo recovery, not a guarantee
   that every misspelling can find every title.

## Validation

- Extend provider-read tests at the search boundary: typo recovery, relevance,
  deduplication, original titles, request budget, short/long queries, fallback
  failure, primary failure, and interruption.
- Live read-only TMDB checks for misspellings and ordinary searches; document
  observed API behavior and recall limits. No provider writes.
- Run tests, typecheck, lint, class-name/router/link checks, and diff whitespace
  validation. Run independent read-only correctness and complexity reviews before
  publishing the PR and waiting for CI.

All changes hot reload. No `bun ios.clean` / `bun android.clean` needed.

## Results

- Live read-only checks recovered *Breaking Bad* (`breakng bad`), *Spirited
  Away* (`spirited awya`), *The Matrix* (`matrx`), *Interstellar*
  (`interstelar`), *Star Wars* (`star wras`), and *The Lord of the Rings*
  (`lord of the rigns`). Literal typo-shaped records remain first.
- Review fixes: restrict fuzzy spans to complete words to reject *Matrimony*
  for `matrx`; preserve Unicode code points when building fallback prefixes.
  Both regression tests were observed failing before their fixes.
- All 1,442 tests pass after the review fix, as do typecheck, lint (five
  existing warnings), class-name/router/link checks, web export, and whitespace
  checks. No interactive device QA or provider writes performed.
