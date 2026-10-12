# Watched indicators on Letterboxd lists

- Extract the person/studio timeline's watched eye into a shared component.
- Opt Letterboxd list grid and row layouts into that indicator; leave watchlists
  and the anime explorer unchanged.
- Resolve slug-only films with `useLetterboxdFilmQuery`, the same public film-page
  identity read used by details. Do not repeat the title-only mapping reverted in
  `docs/solutions/letterboxd-list-watched-indicator.md`.
- Resolve only mounted cells, share the existing query cache, and skip identity
  requests without a connected watched-state provider. Failed reads leave artwork
  and navigation usable without asserting watched state.
- Reuse Trakt/Simkl watched snapshots and their log invalidations. Preserve typed
  movie identity; a Letterboxd TV relationship is not a movie watch match.
- Validate identity handling, lint, types, and repository checks. JS-only: hot
  reload, no native rebuild.

## Validation

- All 1,371 tests pass; typecheck, lint, class-name/navigation/link checks and
  the production web export pass.
- The public `/film/vampire-hunter-d/` page exposes `data-tmdb-type="movie"`
  and `data-tmdb-id="9463"` on its body: the exact identity path resolves the
  film from the earlier failed attempt without a title search.
- Signed-in visual validation remains outstanding; this worktree session has
  no device/browser control tools.
