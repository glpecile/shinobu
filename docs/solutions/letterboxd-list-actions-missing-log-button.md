# Released Letterboxd list films missing the log action

Letterboxd list cards carry a slug, title and year, not a release date. For a
current-year film such as Evil Dead Burn (2026), `filmReleaseStatus` correctly
returns `unknown` until richer metadata arrives. The card-actions sheet used
that sparse snapshot directly, hiding “Mark as watched”, while the details
page resolved the film's TMDB identity and release date first.

The shared `CardActionsSheet` now uses `useLetterboxdFilmQuery` when open,
merges its identity without replacing user state, and applies
`useMediaDetailsQuery` catalogue metadata just like details. These queries
share the details page's cache. No list-wide enrichment or relaxed release
gate is needed; future and unknown releases remain blocked.

Verified on web from `/lists/letterboxd/glp/horrortober-vi-2026`: Evil Dead
Burn offers “Mark as watched”, and pressing it opens the logging sheet with
the Letterboxd manual fallback. Canceled without submitting provider writes.
