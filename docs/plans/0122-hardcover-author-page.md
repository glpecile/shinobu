# Hardcover author page, similar books, and no cover backdrop

A book's Authors rail opened nothing: a Hardcover author has no TMDB or AniList
id, and a name lookup could open a namesake. A book has no backdrop either, so
the hero stretched the cover across the top of the screen.

## Decisions

- **The author page is `/person/hardcover/<id>`**, beside `/person/tmdb` and
  `/person/anilist`, and renders `PersonDetailsView` like an AniList staff
  member. The book read already carries each author's id.
- **One request, two top-level fields.** `authors_by_pk` gives the name, photo,
  bio, birth and death dates and location. `books` filtered on the author's
  contributions gives the books, most readers first, as the Hardcover SDK's
  `GetAuthorBooks` does (`book_status_id` 1 is an active book). Each book's own
  `contributions` for the author gives the role, so a narrated book sits on a
  Narrator row. Both fields fall under `read:catalog:search`, which the app
  already requests.
- **Similar books ride the book read.** `books.cached_similar_book_ids` is a
  ranked `number[]` (SDK 0.1.1). The ids come with `books_by_pk`, which the
  details screen already fetches, and one `books(where: { id: { _in } })`
  read resolves the first 20. The list is empty until someone opens the book
  on hardcover.app, so the rail then renders nothing.
- **No backdrop for a book.** A book has no wide image, so the hero is the
  back-button clearance and the header starts below it.
- **Links on the author page are Hardcover only.** The author is matched by
  id, so name-keyed Letterboxd and AniList links could open a namesake.

## Not built

Genres and moods (`cached_tags`), the ratings histogram
(`ratings_distribution`), reviews, lists, prompts and series pages are
readable too. Each is a follow-up when wanted.
