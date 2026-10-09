# Provider-qualified detail links

Item IDs remain cache keys such as `letterboxd-heat-1995` and
`tmdb-tv-1396`. Split only the first hyphen when making resource URLs, and
restore it at the detail/episode route boundary. Hyphens inside a provider's
ID are significant; do not replace every hyphen or change persisted IDs.

## Cold reads

- Trakt movie and show ID namespaces overlap. New links include `/movie` or
  `/tv`; the cold resolver uses `/search/trakt/{id}?type=movie|show` through
  the existing decoded ID lookup. A cached item of another type cannot win.
  An uncached legacy link asks which type to open instead of guessing.
  Public reads still require the user's own Trakt client ID; absent credentials
  disable the query and the miss state links to Settings.
- Serializd media IDs are TMDB TV IDs. The existing public Simkl lookup can
  resolve them without a Serializd session. Retain the requested TMDB ID:
  Simkl's response can omit it, and metadata and log fan-out need it.
- Cold Letterboxd film resolution remains native-only; on web its miss state
  retains the external film link. No proxy or native configuration changes.

Legacy detail, episode, person, studio, and name-query routes are redirects,
not second screens. UI filters remain queries. Native episode paging updates
the catch-all `episode` path parameter with `setParams`, so it stays one
screen and Back still leaves the pager.
