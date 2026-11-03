---
status: done
date: 2026-11-03
issue: 209
---

# 0119 — A Reading scope for search

Search's Titles scope showed two sections: "Movies & TV" (TMDB `/search/multi`,
or Trakt text search without a TMDB token) and "Anime & Manga" (AniList
`searchMedia`, no type filter). Manga competed with anime for the same 20
AniList results, and nothing narrowed a search to what you read. The owner
wants this instead of, or before, the diary's Reading filter (plan 0117 M4).

## Decisions

- **KTD-1. Reading is one search scope.** The existing FAB opens Movies & TV
  (`?scope=titles`, the default), Reading, Cast & crew, and Studios (with a
  TMDB token). Reading is the one option for everything read (plan 0117
  KTD-10); Movies & TV keeps the combined movie, TV, anime, and manga search.
  No segmented control or separate Movies and TV options.
- **KTD-2. The scope rides the URL as `?scope=reading`.** The FAB icon,
  accessible label, selected picker row, and field placeholder reflect Reading.
  The selection is seeded into state because a tab tap wipes params.
- **KTD-3. Reading searches AniList alone.** The search screen branches on
  the scope: Reading disables the TMDB and Trakt queries, so they send no
  request. Hardcover's books (#400) and the comics tracker (#401) join
  Reading as sections, never as scopes of their own.
- **KTD-4. The request narrows, not the page.**

  | Scope | TMDB | Trakt (fallback) | AniList `media(...)` |
  | --- | --- | --- | --- |
  | Movies & TV | `/search/multi` | `/search/movie,show` | no type filter |
  | Reading | none | none | `type: MANGA` (light novels and one-shots included) |

- **KTD-5. Movies & TV and Reading are separate AniList entries, never stale.**
  The type is the last element of `anilistQueryKeys.search`, and the AniList
  title search uses `staleTime: Infinity`, so flipping back to a scope reads
  the cache instead of spending AniList's 30/min budget
  (`docs/solutions/anilist-rate-limit-retry-storm.md`). gcTime still drops an
  entry once nothing shows it. A new query string keeps the last results up,
  dimmed, but a new type doesn't (`useAniListSearchQuery`'s `placeholderData`),
  because the combined scope's anime under the Reading header reads as the tap
  having been ignored. The section shows its skeleton instead, as the explorer
  does.
- **KTD-6. Labels name what a section holds.**

  | Scope | Movies & TV section | AniList section |
  | --- | --- | --- |
  | Movies & TV | Movies & TV | Anime & Manga |
  | Reading | — | Manga & light novels |

  "Manga & light novels" still reads right beside a future "Books" section.
  Movies & TV keeps the combined AniList label, because its page really is mixed.
- **KTD-7. Empty and failed states keep the screen's rows.** A section with
  nothing disappears and a failed one shows its row. A Reading search with no
  results says so and offers "Search movies & TV". The total-failure notice is
  unchanged.

## Not done

- Reading's idle screen shows Movies & TV's four rails. A Reading idle state (for
  example, the Continue Reading rail) is a follow-up.
- M4, the diary Reading filter, is unchanged and optional (plan 0117).

## Build

JS only. It hot reloads.
