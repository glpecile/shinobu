---
status: done
date: 2026-11-03
issue: 209
---

# 0119 — A format filter for search's Titles scope

Search's Titles scope showed two sections: "Movies & TV" (TMDB `/search/multi`,
or Trakt text search without a TMDB token) and "Anime & Manga" (AniList
`searchMedia`, no type filter). Manga competed with anime for the same 20
AniList results, and nothing narrowed a search to one format. The owner wants
this filter instead of, or before, the diary's Reading filter (plan 0117 M4).

## Decisions

- **KTD-1. Four options: All, Movies, TV, Reading.** The first three are the
  filmography and diary list (`FORMAT_OPTIONS` in
  `features/credit-timeline/group.ts`), reused rather than copied, and folded
  the way `matchesFormat` folds AniList: an anime film is a movie, any other
  anime format is TV. Anime isn't its own option. Users already meet it as a
  movie or a series everywhere else, a fifth segment doesn't fit a phone
  beside "Reading", and All still shows anime. The anime-seasons explorer's
  list (All, TV, Films) is anime-only and stays its own. Reading is the one
  option for everything read (plan 0117 KTD-10).
- **KTD-2. A segmented control under the field, in the URL as `?format=`.**
  `NativeSegmentedControl`, the diary's and explorer's control, sits under the
  field and only in Titles. The scope picker stays about what you search for,
  not how narrowly. The value rides the URL like `?scope=`, is omitted for All,
  and is seeded into state like `?scope=`, because a tab tap wipes params.
  People and Studios ignore it, and it stays put for the next Titles search.
- **KTD-3. A format is a source list.** `TITLE_SOURCES` in
  `features/search/formats.ts` lists each format's sections in order, each
  with its narrowing and label. A source a format leaves out sends no request
  under it. Hardcover's books (#400) and the comics tracker (#401) join
  Reading, and All, as entries in that list, with one query hook each, and
  never as options of their own.
- **KTD-4. The request narrows, not the page.**

  | Format | TMDB | Trakt (fallback) | AniList `media(...)` |
  | --- | --- | --- | --- |
  | All | `/search/multi` | `/search/movie,show` | no type filter |
  | Movies | `/search/movie` | `/search/movie` | `type: ANIME, format: MOVIE` |
  | TV | `/search/tv` | `/search/show` | `type: ANIME, format_not: MOVIE` |
  | Reading | none | none | `type: MANGA` (light novels and one-shots included) |

  TMDB's fuzzy fallbacks stay on the narrowed endpoint.
- **KTD-5. Each format is its own cache entry, never stale.** The type is the
  last element of each provider's existing search key (`tmdbQueryKeys.search`,
  `traktQueryKeys.search`, `anilistQueryKeys.search`). Title searches use
  `staleTime: Infinity`, so flipping back to a format reads the cache instead
  of spending AniList's 30/min budget
  (`docs/solutions/anilist-rate-limit-retry-storm.md`). gcTime still drops an
  entry once nothing shows it. A new query string keeps the last results up,
  dimmed, but a new format doesn't (`keepPreviousSearch`), because the last
  format's titles under the new header read as the tap having been ignored.
  The section shows its skeleton instead, as the explorer does.
- **KTD-6. Labels name what a section holds.**

  | Format | Movies & TV section | AniList section |
  | --- | --- | --- |
  | All | Movies & TV | Anime & Manga |
  | Movies | Movies | Anime films |
  | TV | TV | Anime series |
  | Reading | — | Manga & light novels |

  "Manga & light novels" still reads right beside a future "Books" section.
  All keeps the combined AniList label, because its page really is mixed.
- **KTD-7. Empty and failed states keep the screen's rows.** A section with
  nothing disappears and a failed one shows its row. A narrowed search with no
  results anywhere says which format it searched and offers "Search all
  formats". The total-failure notice is unchanged.

## Not done

- The idle Titles screen keeps its four rails under every format. A Reading
  idle state (for example, the Continue Reading rail) is a follow-up.
- M4, the diary Reading filter, is unchanged and optional (plan 0117).

## Build

JS only. It hot reloads.
